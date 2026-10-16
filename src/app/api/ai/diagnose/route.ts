import { NextResponse, NextRequest } from 'next/server';
import { loadOrBuildConsultativeSnapshot } from '@/lib/ai/context-builder';
import {
  executeCopilotAnalysis,
  getAIObservabilityMetrics,
  getGeminiRuntimeConfig,
  CopilotRouteType,
} from '@/lib/ai/gemini-client';

export async function GET(request: NextRequest) {
  try {
    const currentMonth =
      request.nextUrl.searchParams.get('month') || '2026-10';
    const bypassCache =
      request.nextUrl.searchParams.get('refresh') === '1' ||
      request.nextUrl.searchParams.get('bypassCache') === '1';
    const forceRouteParam = request.nextUrl.searchParams.get('route') as
      | CopilotRouteType
      | null;

    const { snapshot, cacheHit, buildDurationMs } =
      await loadOrBuildConsultativeSnapshot(currentMonth, { bypassCache });

    const aiDiagnosis = await executeCopilotAnalysis({
      snapshot,
      operation: 'DIAGNOSE',
      forceRoute:
        forceRouteParam && ['DIRECT', 'FAST', 'ADVANCED'].includes(forceRouteParam)
          ? forceRouteParam
          : undefined,
      cacheHit,
      abortSignal: request.signal,
    });

    const config = getGeminiRuntimeConfig();

    return NextResponse.json({
      success: true,
      snapshot,
      snapshotMeta: {
        cacheHit,
        buildDurationMs,
      },
      aiDiagnosis,
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
  } catch (error) {
    console.error('[AI Diagnose Error]:', error);
    return NextResponse.json(
      {
        error: 'Falha ao processar diagnóstico financeiro.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
