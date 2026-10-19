import { NextResponse, NextRequest } from 'next/server';
import { loadOrBuildConsultativeSnapshot } from '@/lib/ai/context-builder';
import { handleApiError } from '@/lib/api-error';
import {
  executeCopilotAnalysis,
  getAIObservabilityMetrics,
  getGeminiRuntimeConfig,
  routeFinancialQuery,
} from '@/lib/ai/gemini-client';
import type { ChatTurnMessage, CopilotRouteType } from '@/lib/ai/gemini-client';

export async function GET() {
  const config = getGeminiRuntimeConfig();
  return NextResponse.json({
    success: true,
    observability: getAIObservabilityMetrics(),
    runtimeConfig: {
      fastModel: config.fastModel,
      advancedModel: config.advancedModel,
      hasValidApiKey: config.hasValidApiKey,
      chatMaxOutputTokens: config.chatMaxOutputTokens,
      advancedMaxOutputTokens: config.advancedMaxOutputTokens,
      configWarnings: config.configWarnings,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.message !== 'string' || !body.message.trim()) {
      return NextResponse.json(
        { error: 'O campo "message" é obrigatório para consultar o Copiloto.' },
        { status: 400 }
      );
    }

    const message = body.message.trim().slice(0, 1000);
    const period =
      typeof body.month === 'string' && /^\d{4}-\d{2}$/.test(body.month)
        ? body.month
        : '2026-10';
    const forceRoute =
      body.forceRoute &&
      ['DIRECT', 'FAST', 'ADVANCED'].includes(body.forceRoute)
        ? (body.forceRoute as CopilotRouteType)
        : undefined;
    const allowDirectDeterministic =
      typeof body.allowDirectDeterministic === 'boolean'
        ? body.allowDirectDeterministic
        : true;

    const history: ChatTurnMessage[] = Array.isArray(body.history)
      ? body.history
          .filter(
            (h: unknown): h is ChatTurnMessage =>
              Boolean(
                h &&
                  typeof h === 'object' &&
                  ((h as ChatTurnMessage).role === 'user' ||
                    (h as ChatTurnMessage).role === 'assistant') &&
                  typeof (h as ChatTurnMessage).content === 'string'
              )
          )
          .slice(-6)
      : [];

    const wantsStream =
      Boolean(body.stream) ||
      request.headers.get('accept')?.includes('text/event-stream');

    // Load or reuse short-lived consultative snapshot in single pass
    const { snapshot, cacheHit, buildDurationMs } =
      await loadOrBuildConsultativeSnapshot(period);

    if (wantsStream) {
      const encoder = new TextEncoder();
      const preRoute = routeFinancialQuery({
        prompt: message,
        operation: 'CHAT',
        forceRoute,
        allowDirectDeterministic,
      });

      const stream = new ReadableStream({
        async start(controller) {
          // Enqueue tolerante: apos o cliente abortar, o controller recusa escritas.
          // Sem isto, o encerramento normal lancaria e viraria erro nao tratado.
          const sendEvent = (event: string, data: unknown) => {
            try {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
              );
              return true;
            } catch {
              return false;
            }
          };

          try {
            // 1. Emit route decision immediately for instant UI feedback
            sendEvent('route', {
              route: preRoute.route,
              targetModel: preRoute.targetModel,
              reason: preRoute.reason,
              cacheHit,
              buildDurationMs,
            });

            // 2. Execute analysis with request.signal cancellation support
            const response = await executeCopilotAnalysis({
              snapshot,
              operation: 'CHAT',
              userPrompt: message,
              history,
              forceRoute,
              allowDirectDeterministic,
              cacheHit,
              abortSignal: request.signal,
            });

            // 3. Emit progressive text chunks for smooth chat rendering
            const answerText = response.answer || response.summary;
            const tokens = answerText.match(/.{1,48}(\s|$)/g) || [answerText];
            for (const chunk of tokens) {
              if (request.signal.aborted) break;
              sendEvent('delta', { text: chunk });
            }

            // 4. Terminal event. Um stream interrompido pelo cliente NAO pode ser
            //    reportado como `complete`/`success: true` — seria declarar entrega
            //    integral de uma resposta parcial.
            if (request.signal.aborted) {
              sendEvent('aborted', {
                success: false,
                reason: 'CLIENT_ABORTED',
                deliveredChars: answerText.length,
              });
              return;
            }

            // 5. Emit final validated contract & observability summary
            sendEvent('complete', {
              success: true,
              response,
              snapshotMeta: { cacheHit, buildDurationMs },
              observability: getAIObservabilityMetrics(),
            });
          } catch (err) {
            // Cancelamento do cliente NAO e falha: nao pode ser reportado como `error`,
            // que sugeriria defeito do servidor ou do provedor.
            const errCode = (err as { code?: string } | null)?.code;
            const errName = (err as { name?: string } | null)?.name;
            const isClientAbort =
              request.signal.aborted ||
              errCode === 'ABORTED_BY_CLIENT' ||
              errName === 'ClientAbortError';

            if (isClientAbort) {
              sendEvent('aborted', { success: false, reason: 'CLIENT_ABORTED' });
            } else {
              sendEvent('error', {
                success: false,
                error:
                  err instanceof Error
                    ? err.message
                    : 'Erro ao processar resposta do Copiloto.',
              });
            }
          } finally {
            try {
              controller.close();
            } catch {
              // Stream ja encerrado pelo cliente.
            }
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    const response = await executeCopilotAnalysis({
      snapshot,
      operation: 'CHAT',
      userPrompt: message,
      history,
      forceRoute,
      allowDirectDeterministic,
      cacheHit,
      abortSignal: request.signal,
    });

    return NextResponse.json({
      success: true,
      response,
      snapshotMeta: {
        cacheHit,
        buildDurationMs,
      },
      observability: getAIObservabilityMetrics(),
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Falha ao processar mensagem no Copiloto Financeiro.', 'ai:chat:POST');
  }
}
