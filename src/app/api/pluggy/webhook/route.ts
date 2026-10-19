import { NextResponse, NextRequest } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { processedWebhookEvents } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createHash, timingSafeEqual } from 'node:crypto';
import { handleApiError } from '@/lib/api-error';

const STALE_PROCESSING_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Validates webhook authenticity using constant-time comparison.
 * Pluggy webhooks support custom headers configured on the webhook registration.
 * FinAI expects the shared secret in PLUGGY_WEBHOOK_SECRET, passed via:
 * - 'x-webhook-secret' header, or
 * - 'x-pluggy-webhook-token' header, or
 * - 'authorization: Bearer <secret>' header.
 *
 * If PLUGGY_WEBHOOK_SECRET is not configured on the server, the endpoint
 * safely rejects requests with HTTP 401 Unauthorized to prevent spoofing.
 */
export function verifyWebhookAuth(request: NextRequest): { authorized: boolean; reason?: string } {
  const configuredSecret = process.env.PLUGGY_WEBHOOK_SECRET?.trim();
  if (!configuredSecret) {
    return {
      authorized: false,
      reason: 'Webhook não autenticado: segredo PLUGGY_WEBHOOK_SECRET não configurado no servidor.',
    };
  }

  const authHeader = request.headers.get('authorization')?.trim() || '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const customHeader =
    request.headers.get('x-webhook-secret')?.trim() ||
    request.headers.get('x-pluggy-webhook-token')?.trim() ||
    '';

  const receivedToken = customHeader || bearerToken;
  if (!receivedToken) {
    return {
      authorized: false,
      reason: 'Credencial de autenticação ausente no cabeçalho do webhook.',
    };
  }

  const secretBuf = Buffer.from(configuredSecret, 'utf-8');
  const tokenBuf = Buffer.from(receivedToken, 'utf-8');

  if (secretBuf.length !== tokenBuf.length) {
    return {
      authorized: false,
      reason: 'Credencial de webhook inválida.',
    };
  }

  if (!timingSafeEqual(secretBuf, tokenBuf)) {
    return {
      authorized: false,
      reason: 'Credencial de webhook inválida.',
    };
  }

  return { authorized: true };
}

export async function POST(request: NextRequest) {
  try {
    await ensureDbInitialized();

    // 1. Authenticate Request
    const authResult = verifyWebhookAuth(request);
    if (!authResult.authorized) {
      return NextResponse.json(
        { error: authResult.reason || 'Não autorizado.' },
        { status: 401 }
      );
    }

    const rawBody = await request.text();
    if (!rawBody || !rawBody.trim()) {
      return NextResponse.json(
        { error: 'Corpo do webhook vazio.' },
        { status: 400 }
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: 'Formato JSON inválido.' },
        { status: 400 }
      );
    }

    const event = typeof payload.event === 'string' ? payload.event : 'UNKNOWN_EVENT';
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');

    // 2. Primary Identity: eventId takes precedence over body hash
    const rawEventId =
      typeof payload.eventId === 'string' && payload.eventId.trim()
        ? payload.eventId.trim()
        : typeof payload.id === 'string' && payload.id.trim()
        ? payload.id.trim()
        : null;

    // Use eventId as primary identity when available; fallback to hash-based id only if missing
    const eventId = rawEventId || `evt_hash_${payloadHash.slice(0, 16)}`;

    const itemId =
      typeof payload.itemId === 'string'
        ? payload.itemId
        : typeof (payload.data as Record<string, unknown>)?.itemId === 'string'
        ? ((payload.data as Record<string, unknown>).itemId as string)
        : null;

    // 3. Idempotency Check using primary eventId
    const existing = await db
      .select()
      .from(processedWebhookEvents)
      .where(eq(processedWebhookEvents.id, eventId));

    if (existing.length > 0) {
      const existingRecord = existing[0];
      const nowMs = Date.now();
      const processedAtMs = new Date(existingRecord.processedAt).getTime();
      const ageMs = nowMs - processedAtMs;

      // If previously stuck in PROCESSING for more than 5 minutes, allow recovery
      if (existingRecord.status === 'PROCESSING' && ageMs > STALE_PROCESSING_TTL_MS) {
        // Recover stuck event: update processedAt and proceed to reprocess
        await db
          .update(processedWebhookEvents)
          .set({
            status: 'PROCESSING',
            processedAt: new Date(nowMs).toISOString(),
            errorMessage: 'Recuperado após interrupção anterior.',
          })
          .where(eq(processedWebhookEvents.id, eventId));
      } else {
        return NextResponse.json(
          {
            received: true,
            duplicate: true,
            eventId,
            status: existingRecord.status,
            message:
              existingRecord.status === 'PROCESSING'
                ? 'Evento em processamento ativo por outro worker.'
                : 'Evento já processado anteriormente (idempotência garantida).',
          },
          {
            status: 200,
            headers: {
              'X-FinAI-Idempotent': 'HIT',
            },
          }
        );
      }
    } else {
      // 4. Durable Processing: Persist event in PROCESSING state BEFORE executing work
      const nowIso = new Date().toISOString();
      await db.insert(processedWebhookEvents).values({
        id: eventId,
        eventType: event,
        itemId,
        payloadHash,
        status: 'PROCESSING',
        processedAt: nowIso,
      });
    }

    // 5. Execute Event-Specific Work
    let processingStatus: 'PROCESSED' | 'FAILED' = 'PROCESSED';
    let errorMessage: string | null = null;

    if (event === 'ITEM/ERROR' || event === 'ITEM/LOGIN_ERROR') {
      processingStatus = 'FAILED';
      errorMessage =
        typeof (payload.error as Record<string, unknown>)?.message === 'string'
          ? ((payload.error as Record<string, unknown>).message as string)
          : `Falha reportada pelo conector (${event})`;
    }

    // 6. Finalize Event State
    await db
      .update(processedWebhookEvents)
      .set({
        status: processingStatus,
        errorMessage,
        processedAt: new Date().toISOString(),
      })
      .where(eq(processedWebhookEvents.id, eventId));

    return NextResponse.json(
      {
        received: true,
        duplicate: false,
        eventId,
        event,
        itemId,
        status: processingStatus,
        developmentNotice:
          'Em ambiente local (localhost), os webhooks da Pluggy requerem um túnel público (como ngrok) ou simulador direto.',
      },
      {
        status: 200,
        headers: {
          'X-FinAI-Idempotent': 'MISS',
          'X-FinAI-Webhook-Environment': 'localhost',
        },
      }
    );
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao processar webhook do Open Finance (Pluggy).', 'pluggy:webhook:POST');
  }
}
