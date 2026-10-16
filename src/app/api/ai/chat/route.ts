import { NextResponse, NextRequest } from 'next/server';
import { loadOrBuildConsultativeSnapshot } from '@/lib/ai/context-builder';
import {
  executeCopilotAnalysis,
  getAIObservabilityMetrics,
  getGeminiRuntimeConfig,
  routeFinancialQuery,
  ChatTurnMessage,
  CopilotRouteType,
} from '@/lib/ai/gemini-client';

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
          const sendEvent = (event: string, data: unknown) => {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
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

            // 4. Emit final validated contract & observability summary
            sendEvent('complete', {
              success: true,
              response,
              snapshotMeta: { cacheHit, buildDurationMs },
              observability: getAIObservabilityMetrics(),
            });
          } catch (err) {
            sendEvent('error', {
              error:
                err instanceof Error
                  ? err.message
                  : 'Erro ao processar resposta do Copiloto.',
            });
          } finally {
            controller.close();
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
  } catch (error) {
    console.error('[AI Chat Error]:', error);
    return NextResponse.json(
      {
        error: 'Falha ao processar mensagem no Copiloto Financeiro.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
