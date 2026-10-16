'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
  ArrowUpRight,
  Cpu,
  ShieldCheck,
  Zap,
  Send,
  Trash2,
  Activity,
  Database,
  HelpCircle,
  Layers,
  Clock,
  StopCircle,
  MessageSquare,
  FileSpreadsheet,
  Calendar,
} from 'lucide-react';

interface CopilotObservation {
  title: string;
  detail: string;
  category:
    | 'CASH_FLOW'
    | 'BUDGET'
    | 'GOALS'
    | 'PATRIMONY'
    | 'LIQUIDITY'
    | 'ALERTS';
  epistemicType: 'FACT' | 'INTERPRETATION' | 'HYPOTHESIS' | 'INSUFFICIENT_DATA';
  metricRefs: string[];
}

interface CopilotRecommendation {
  action: string;
  rationale: string;
  impactEstimate: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  basedOn: string[];
}

interface CopilotReferencedMetric {
  key: string;
  label: string;
  value: string;
  sourceEngine: 'MATH_ENGINE' | 'PATRIMONY_ENGINE' | 'PLANNING_ENGINE';
}

interface CopilotExecutionMeta {
  route: 'DIRECT' | 'FAST' | 'ADVANCED';
  operation: 'CHAT' | 'DIAGNOSE';
  modelUsed: string;
  targetModel: string;
  isFallback: boolean;
  fallbackType?: 'NONE' | 'SECONDARY_MODEL' | 'DETERMINISTIC_ENGINE';
  fallbackReason?: string;
  latencyMs: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  retries: number;
  cacheHit?: boolean;
  routeReason: string;
  timestamp: string;
}

interface CopilotStructuredResponse {
  summary: string;
  answer: string;
  statusFinanceiro: 'SAUDAVEL' | 'ATENCAO' | 'CRITICO';
  observations: CopilotObservation[];
  recommendations: CopilotRecommendation[];
  limitations: string[];
  referencedMetrics: CopilotReferencedMetric[];
  followUpSuggestions: string[];
  meta: CopilotExecutionMeta;
  diagnostico: string;
  pontosCriticos: string[];
  recomendacoes: Array<{
    acao: string;
    impactoEstimado: string;
    prioridade: 'ALTA' | 'MEDIA' | 'BAIXA';
  }>;
  ProjecaoAnual: string;
}

interface RouteObservabilityStats {
  count: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  fallbackCount: number;
}

interface AIObservabilitySummary {
  totalCalls: number;
  overallP50LatencyMs: number;
  overallP95LatencyMs: number;
  cacheHitCount: number;
  totalRetries: number;
  byRoute: Record<'DIRECT' | 'FAST' | 'ADVANCED', RouteObservabilityStats>;
  byModel: Record<string, number>;
}

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  response?: CopilotStructuredResponse;
  streamingRoute?: {
    route: 'DIRECT' | 'FAST' | 'ADVANCED';
    targetModel: string;
    reason: string;
  };
  isStreaming?: boolean;
}

const CANONICAL_PROMPTS: Array<{
  label: string;
  prompt: string;
  expectedRoute: 'DIRECT' | 'FAST' | 'ADVANCED';
}> = [
  {
    label: 'Quanto gastei neste mês?',
    prompt: 'Quanto gastei neste mês?',
    expectedRoute: 'DIRECT',
  },
  {
    label: 'Categorias que estouraram',
    prompt: 'Quais categorias estouraram o orçamento neste mês?',
    expectedRoute: 'FAST',
  },
  {
    label: 'Variação do meu saldo',
    prompt: 'O que explica a queda ou melhora do meu saldo neste período?',
    expectedRoute: 'FAST',
  },
  {
    label: 'Progresso das metas',
    prompt: 'Estou no caminho para atingir minhas metas financeiras?',
    expectedRoute: 'FAST',
  },
  {
    label: 'Risco de liquidez futura',
    prompt:
      'Se eu mantiver esse ritmo, terei problema de liquidez nos próximos 6 meses?',
    expectedRoute: 'ADVANCED',
  },
  {
    label: 'Pressão no patrimônio e caixa',
    prompt:
      'O que mais pressiona meu patrimônio líquido e meu fluxo de caixa atualmente?',
    expectedRoute: 'ADVANCED',
  },
];

const EPISTEMIC_BADGES: Record<
  CopilotObservation['epistemicType'],
  { label: string; className: string }
> = {
  FACT: {
    label: 'Fato Calculado',
    className: 'bg-[#E4EFE6] text-[#245A3C] border-[#D1E2D4]',
  },
  INTERPRETATION: {
    label: 'Interpretação IA',
    className: 'bg-[#EBF2FA] text-[#2A4365] border-[#D0DFEE]',
  },
  HYPOTHESIS: {
    label: 'Hipótese / Projeção',
    className: 'bg-[#F5EEDB] text-[#795C24] border-[#E8DEC7]',
  },
  INSUFFICIENT_DATA: {
    label: 'Dados Insuficientes',
    className: 'bg-[#F0EDE6] text-[#5F635C] border-[#D6CFC2]',
  },
};

const SOURCE_ENGINE_LABELS: Record<
  CopilotReferencedMetric['sourceEngine'],
  string
> = {
  MATH_ENGINE: 'Motor Financeiro (Caixa)',
  PATRIMONY_ENGINE: 'Motor Patrimonial (Balanço)',
  PLANNING_ENGINE: 'Motor de Planejamento',
};

export interface CopilotViewProps {
  metrics?: unknown;
  diagnosis?: unknown;
  onRunDiagnosis?: () => Promise<void> | void;
  isGenerating?: boolean;
}

export function CopilotView(_props?: CopilotViewProps) {
  const [selectedMonth, setSelectedMonth] = useState('2026-10');
  const [loadingDiagnosis, setLoadingDiagnosis] = useState(true);
  const [diagnosisData, setDiagnosisData] = useState<{
    snapshot: Record<string, unknown>;
    aiDiagnosis: CopilotStructuredResponse;
    runtimeConfig?: {
      fastModel: string;
      advancedModel: string;
      hasValidApiKey: boolean;
    };
  } | null>(null);
  const [observability, setObservability] =
    useState<AIObservabilitySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Interactive Chat State (Ephemeral in-memory for privacy)
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [routeMode, setRouteMode] = useState<'AUTO' | 'FAST' | 'ADVANCED'>(
    'AUTO'
  );
  const [showPayloadModal, setShowPayloadModal] = useState(false);

  const chatAbortRef = useRef<AbortController | null>(null);
  const diagnosisAbortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const fetchDiagnosis = useCallback(
    async (refresh = false) => {
      if (diagnosisAbortRef.current) {
        diagnosisAbortRef.current.abort();
      }
      const controller = new AbortController();
      diagnosisAbortRef.current = controller;

      setLoadingDiagnosis(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/ai/diagnose?month=${selectedMonth}${refresh ? '&refresh=1' : ''}`,
          { signal: controller.signal }
        );
        const json = await res.json();
        if (!res.ok || json.error) {
          throw new Error(json.error || 'Erro ao carregar diagnóstico.');
        }
        setDiagnosisData(json);
        if (json.observability) {
          setObservability(json.observability);
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
      } finally {
        setLoadingDiagnosis(false);
      }
    },
    [selectedMonth]
  );

  useEffect(() => {
    fetchDiagnosis(false);
    return () => {
      diagnosisAbortRef.current?.abort();
      chatAbortRef.current?.abort();
    };
  }, [fetchDiagnosis]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  const cancelActiveChat = () => {
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    setChatBusy(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming
          ? {
              ...m,
              isStreaming: false,
              content: m.content || 'Análise cancelada pelo usuário.',
            }
          : m
      )
    );
  };

  const sendChatMessage = async (promptText?: string) => {
    const text = (promptText ?? inputPrompt).trim();
    if (!text) return;

    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
    }
    const controller = new AbortController();
    chatAbortRef.current = controller;

    const userMsgId = `u-${Date.now()}`;
    const assistantMsgId = `a-${Date.now() + 1}`;

    const historyForApi = messages
      .filter((m) => !m.isStreaming && m.content.trim().length > 0)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    setInputPrompt('');
    setChatBusy(true);

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: text },
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      },
    ]);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          message: text,
          month: selectedMonth,
          history: historyForApi,
          forceRoute: routeMode === 'AUTO' ? undefined : routeMode,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
          errJson.error || 'Falha na comunicação com o Copiloto.'
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          const lines = block.split('\n');
          let eventType = 'message';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataStr += line.slice(5).trim();
            }
          }
          if (!dataStr) continue;

          const payload = JSON.parse(dataStr);
          if (eventType === 'route') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, streamingRoute: payload }
                  : m
              )
            );
          } else if (eventType === 'delta') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content + (payload.text || '') }
                  : m
              )
            );
          } else if (eventType === 'complete') {
            const finalResponse: CopilotStructuredResponse = payload.response;
            if (payload.observability) {
              setObservability(payload.observability);
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: finalResponse.answer || finalResponse.summary,
                      response: finalResponse,
                      isStreaming: false,
                    }
                  : m
              )
            );
          } else if (eventType === 'error') {
            throw new Error(payload.error || 'Erro no stream do Copiloto.');
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                isStreaming: false,
                content: `Não foi possível concluir a resposta: ${
                  err instanceof Error ? err.message : 'Erro inesperado'
                }`,
              }
            : m
        )
      );
    } finally {
      setChatBusy(false);
    }
  };

  const diag = diagnosisData?.aiDiagnosis;
  const statusFinanceiro = diag?.statusFinanceiro || 'ATENCAO';

  const statusConfig = {
    SAUDAVEL: {
      color: 'text-[#245A3C]',
      surface: 'bg-[#E4EFE6] border-[#D1E2D4]',
      icon: CheckCircle2,
      label: 'Saúde Financeira Sólida',
    },
    ATENCAO: {
      color: 'text-[#795C24]',
      surface: 'bg-[#F5EEDB] border-[#E8DEC7]',
      icon: AlertTriangle,
      label: 'Requer Atenção Tática',
    },
    CRITICO: {
      color: 'text-[#963F36]',
      surface: 'bg-[#F8E8E5] border-[#EED0CC]',
      icon: ShieldAlert,
      label: 'Alerta Crítico de Liquidez / Orçamento',
    },
  }[statusFinanceiro];

  const StatusIcon = statusConfig.icon;
  const availableMonths = [
    { value: '2026-07', label: 'Julho 2026 (2026-07)' },
    { value: '2026-08', label: 'Agosto 2026 (2026-08)' },
    { value: '2026-09', label: 'Setembro 2026 (2026-09)' },
    { value: '2026-10', label: 'Outubro 2026 (2026-10)' },
    { value: '2026-11', label: 'Novembro 2026 (2026-11)' },
    { value: '2026-12', label: 'Dezembro 2026 (2026-12)' },
  ];

  return (
    <div className="space-y-6 font-sans">
      {/* 1. Editorial Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-3 border-b border-[#E7E1D7]">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-[#777A72]">
              Inteligência Consultiva • Arquitetura Multimodelo Gemini
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#F0EDE6] text-[#242823] border border-[#E7E1D7]">
              <Zap className="w-3 h-3 text-[#245A3C]" />
              Fast:{' '}
              {diagnosisData?.runtimeConfig?.fastModel ||
                'gemini-3.5-flash-lite'}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#F5EEDB] text-[#795C24] border border-[#E8DEC7]">
              <Cpu className="w-3 h-3 text-[#795C24]" />
              Advanced:{' '}
              {diagnosisData?.runtimeConfig?.advancedModel ||
                'gemini-3.8-flash'}
            </span>
          </div>
          <h1 className="font-serif text-3xl md:text-4xl text-[#242823] tracking-tight">
            Copiloto & Análise Financeira
          </h1>
          <p className="text-xs font-sans text-[#5F635C] mt-1">
            Diagnóstico explicável e chat contextual de baixa latência
            fundamentados nos motores determinísticos de Caixa, Patrimônio e
            Planejamento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#E7E1D7] bg-[#FFFFFF] text-xs">
            <Calendar className="w-3.5 h-3.5 text-[#777A72]" />
            <span className="text-[#777A72] font-medium">Período:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              aria-label="Selecionar mês de referência"
              className="font-mono font-semibold text-[#242823] bg-transparent focus:outline-none cursor-pointer"
            >
              {availableMonths.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowPayloadModal((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#D6CFC2] bg-[#FFFFFF] hover:bg-[#F3F1EB] text-xs font-sans font-medium text-[#242823] transition-colors"
          >
            <Database className="w-3.5 h-3.5 text-[#5F635C]" />
            <span>
              {showPayloadModal ? 'Ocultar Snapshot' : 'Inspecionar Snapshot'}
            </span>
          </button>

          <button
            onClick={() => fetchDiagnosis(true)}
            disabled={loadingDiagnosis}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#253A32] hover:bg-[#1B2B25] disabled:opacity-50 text-xs font-sans font-medium text-[#FFFFFF] transition-colors shadow-xs"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[#B29A70] ${
                loadingDiagnosis ? 'animate-spin' : ''
              }`}
            />
            <span>Recalcular Diagnóstico</span>
          </button>
        </div>
      </div>

      {/* 2. Operational Telemetry Strip */}
      {observability && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-[#FFFFFF] border border-[#E7E1D7] rounded-lg p-3.5 shadow-xs text-xs">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-[#B29A70] shrink-0" />
            <div>
              <span className="text-[#777A72] block text-[10px] uppercase font-semibold tracking-wider">
                Latência p50 / p95
              </span>
              <span className="font-mono font-bold tabular-nums text-[#242823]">
                {observability.overallP50LatencyMs.toFixed(0)}ms /{' '}
                {observability.overallP95LatencyMs.toFixed(0)}ms
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:border-l sm:border-[#E7E1D7] sm:pl-3">
            <Zap className="w-4 h-4 text-[#245A3C] shrink-0" />
            <div>
              <span className="text-[#777A72] block text-[10px] uppercase font-semibold tracking-wider">
                Rota Direta (0 Tokens)
              </span>
              <span className="font-mono font-bold tabular-nums text-[#242823]">
                {observability.byRoute.DIRECT.count} chamadas (p50:{' '}
                {observability.byRoute.DIRECT.p50LatencyMs.toFixed(1)}ms)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:border-l sm:border-[#E7E1D7] sm:pl-3">
            <Activity className="w-4 h-4 text-[#2A4365] shrink-0" />
            <div>
              <span className="text-[#777A72] block text-[10px] uppercase font-semibold tracking-wider">
                Rota Rápida (Flash-Lite)
              </span>
              <span className="font-mono font-bold tabular-nums text-[#242823]">
                {observability.byRoute.FAST.count} chamadas (p50:{' '}
                {observability.byRoute.FAST.p50LatencyMs.toFixed(0)}ms)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:border-l sm:border-[#E7E1D7] sm:pl-3">
            <Layers className="w-4 h-4 text-[#795C24] shrink-0" />
            <div>
              <span className="text-[#777A72] block text-[10px] uppercase font-semibold tracking-wider">
                Rota Avançada (3.8 Flash)
              </span>
              <span className="font-mono font-bold tabular-nums text-[#242823]">
                {observability.byRoute.ADVANCED.count} chamadas (p50:{' '}
                {observability.byRoute.ADVANCED.p50LatencyMs.toFixed(0)}ms)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:border-l sm:border-[#E7E1D7] sm:pl-3">
            <ShieldCheck className="w-4 h-4 text-[#245A3C] shrink-0" />
            <div>
              <span className="text-[#777A72] block text-[10px] uppercase font-semibold tracking-wider">
                Snapshot Cache & Retries
              </span>
              <span className="font-mono font-bold tabular-nums text-[#242823]">
                {observability.cacheHitCount} hits •{' '}
                {observability.totalRetries} retries
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Optional Sanitized Snapshot Inspector */}
      {showPayloadModal && diagnosisData?.snapshot && (
        <div className="bg-[#FFFFFF] rounded-lg p-5 border border-[#D6CFC2] shadow-xs space-y-2.5">
          <div className="flex items-center justify-between border-b border-[#E7E1D7] pb-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#253A32] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#245A3C]" /> Snapshot
              Consultivo Unificado & Sanitizado (Zero Credenciais / Zero PII)
            </span>
            <button
              onClick={() => setShowPayloadModal(false)}
              className="text-xs font-medium text-[#5F635C] hover:text-[#242823]"
            >
              Fechar
            </button>
          </div>
          <pre className="text-[11px] font-mono overflow-x-auto max-h-72 p-3.5 bg-[#F6F3ED] border border-[#E7E1D7] rounded-md text-[#242823]">
            {JSON.stringify(diagnosisData.snapshot, null, 2)}
          </pre>
        </div>
      )}

      {/* 3. Interactive Low-Latency Financial Chat Panel */}
      <div className="bg-[#FFFFFF] border border-[#E7E1D7] rounded-lg shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 bg-[#F0EDE6]/70 border-b border-[#E7E1D7] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#253A32]" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#242823]">
              Chat Consultivo de Baixa Latência
            </h2>
            <span className="text-[11px] text-[#777A72]">
              • Sessão efêmera em memória (privacidade por padrão)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="copilot-route-mode"
              className="text-[11px] text-[#5F635C] font-medium"
            >
              Roteamento:
            </label>
            <select
              id="copilot-route-mode"
              value={routeMode}
              onChange={(e) =>
                setRouteMode(e.target.value as 'AUTO' | 'FAST' | 'ADVANCED')
              }
              className="px-2.5 py-1 text-xs rounded-md border border-[#D6CFC2] bg-[#FFFFFF] text-[#242823] font-medium focus:outline-none focus:border-[#253A32]"
            >
              <option value="AUTO">Automático por Complexidade</option>
              <option value="FAST">Forçar Rota Rápida (Flash-Lite)</option>
              <option value="ADVANCED">Forçar Rota Avançada (3.8 Flash)</option>
            </select>

            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#5F635C] hover:text-[#963F36] rounded-md hover:bg-[#F8E8E5] transition-colors"
                title="Limpar conversa da sessão"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
            )}
          </div>
        </div>

        {/* Canonical Prompt Chips */}
        <div className="px-5 py-2.5 bg-[#F6F3ED]/60 border-b border-[#E7E1D7] flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#777A72] shrink-0">
            Consultas Rápidas:
          </span>
          {CANONICAL_PROMPTS.map((item) => (
            <button
              key={item.label}
              onClick={() => sendChatMessage(item.prompt)}
              disabled={chatBusy}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#FFFFFF] hover:bg-[#F3F1EB] text-[#242823] border border-[#E7E1D7] transition-colors disabled:opacity-50"
            >
              <span>{item.label}</span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold uppercase border ${
                  item.expectedRoute === 'DIRECT'
                    ? 'bg-[#E4EFE6] text-[#245A3C] border-[#D1E2D4]'
                    : item.expectedRoute === 'FAST'
                      ? 'bg-[#EBF2FA] text-[#2A4365] border-[#D0DFEE]'
                      : 'bg-[#F5EEDB] text-[#795C24] border-[#E8DEC7]'
                }`}
              >
                {item.expectedRoute}
              </span>
            </button>
          ))}
        </div>

        {/* Messages Stream Area */}
        <div className="p-5 space-y-4 max-h-[420px] overflow-y-auto bg-[#FFFFFF]">
          {messages.length === 0 ? (
            <div className="text-center py-7 px-4 rounded-lg bg-[#F6F3ED]/60 border border-dashed border-[#D6CFC2] space-y-1.5">
              <p className="text-sm font-medium text-[#242823]">
                Consulte seus gastos, execução orçamentária, metas, liquidez
                futura ou balanço patrimonial.
              </p>
              <p className="text-xs text-[#5F635C] max-w-2xl mx-auto leading-relaxed">
                Consultas diretas de indicador único respondem instantaneamente
                pelo motor determinístico (<span className="font-mono">0 tokens</span>
                ); dúvidas cotidianas utilizam{' '}
                <code className="font-mono text-[#245A3C] font-semibold">
                  gemini-3.5-flash-lite
                </code>
                ; projeções multi-período e simulações acionam{' '}
                <code className="font-mono text-[#795C24] font-semibold">
                  gemini-3.8-flash
                </code>
                .
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-3xl rounded-lg px-4 py-3 text-xs sm:text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#253A32] text-[#FFFFFF]'
                      : 'bg-[#F6F3ED] text-[#242823] border border-[#E7E1D7]'
                  }`}
                >
                  {/* Route / Streaming Indicator for Assistant */}
                  {msg.role === 'assistant' &&
                    (msg.response?.meta || msg.streamingRoute) && (
                      <div className="flex flex-wrap items-center gap-2 mb-2 pb-1.5 border-b border-[#E7E1D7] text-[11px]">
                        {(() => {
                          const route =
                            msg.response?.meta.route ||
                            msg.streamingRoute?.route ||
                            'FAST';
                          const model =
                            msg.response?.meta.modelUsed ||
                            msg.streamingRoute?.targetModel ||
                            '';
                          return (
                            <>
                              <span
                                className={`px-2 py-0.5 rounded font-semibold border text-[10px] uppercase tracking-wider ${
                                  route === 'DIRECT'
                                    ? 'bg-[#E4EFE6] text-[#245A3C] border-[#D1E2D4]'
                                    : route === 'ADVANCED'
                                      ? 'bg-[#F5EEDB] text-[#795C24] border-[#E8DEC7]'
                                      : 'bg-[#EBF2FA] text-[#2A4365] border-[#D0DFEE]'
                                }`}
                              >
                                {route === 'DIRECT'
                                  ? 'Rota Determinística Direta'
                                  : route === 'ADVANCED'
                                    ? 'Análise Profunda (Rota Avançada)'
                                    : 'Rota Rápida (Baixa Latência)'}
                              </span>
                              <span className="font-mono text-[#5F635C]">
                                {model}
                              </span>
                              {msg.response?.meta && (
                                <span className="font-mono tabular-nums text-[#777A72]">
                                  • {msg.response.meta.latencyMs.toFixed(0)}ms •{' '}
                                  {msg.response.meta.estimatedInputTokens +
                                    msg.response.meta.estimatedOutputTokens}{' '}
                                  tokens
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                  {/* Discreet indicator while advanced analysis is running */}
                  {msg.isStreaming && !msg.content && (
                    <div className="flex items-center gap-2 text-xs text-[#253A32] py-1">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#B29A70]" />
                      <span>
                        {msg.streamingRoute?.route === 'ADVANCED'
                          ? `Executando análise financeira profunda via ${msg.streamingRoute.targetModel}...`
                          : 'Consultando motores determinísticos e sintetizando resposta...'}
                      </span>
                    </div>
                  )}

                  <div className="whitespace-pre-line">{msg.content}</div>

                  {/* Referenced Deterministic Metrics */}
                  {msg.response?.referencedMetrics &&
                    msg.response.referencedMetrics.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-[#E7E1D7] flex flex-wrap gap-1.5">
                        {msg.response.referencedMetrics
                          .slice(0, 4)
                          .map((metric) => (
                            <span
                              key={metric.key}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#FFFFFF] text-[#5F635C] border border-[#E7E1D7]"
                            >
                              <FileSpreadsheet className="w-2.5 h-2.5 text-[#245A3C]" />
                              <span>{metric.label}:</span>
                              <strong className="font-mono tabular-nums text-[#242823]">
                                {metric.value}
                              </strong>
                            </span>
                          ))}
                      </div>
                    )}
                </div>

                {/* Contextual Follow-up Suggestions */}
                {msg.role === 'assistant' &&
                  !msg.isStreaming &&
                  msg.response?.followUpSuggestions &&
                  msg.response.followUpSuggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {msg.response.followUpSuggestions.map((sug, i) => (
                        <button
                          key={i}
                          onClick={() => sendChatMessage(sug)}
                          disabled={chatBusy}
                          className="text-[11px] px-2.5 py-1 rounded-md bg-[#FFFFFF] hover:bg-[#F3F1EB] text-[#5F635C] hover:text-[#242823] border border-[#E7E1D7] transition-colors"
                        >
                          ↳ {sug}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendChatMessage();
          }}
          className="p-3.5 bg-[#F0EDE6]/60 border-t border-[#E7E1D7] flex items-center gap-2.5"
        >
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder="Pergunte ao Copiloto (ex: 'Quanto gastei neste mês?' ou 'Terei problema de liquidez nos próximos meses?')..."
            disabled={chatBusy}
            className="flex-1 px-3.5 py-2 text-xs sm:text-sm rounded-md bg-[#FFFFFF] border border-[#D6CFC2] text-[#242823] placeholder:text-[#777A72] focus:outline-none focus:border-[#253A32]"
          />
          {chatBusy ? (
            <button
              type="button"
              onClick={cancelActiveChat}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#963F36] bg-[#F8E8E5] hover:bg-[#EED0CC] rounded-md border border-[#EED0CC] transition-colors"
            >
              <StopCircle className="w-3.5 h-3.5" />
              <span>Cancelar</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputPrompt.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#FFFFFF] bg-[#253A32] hover:bg-[#1B2B25] disabled:opacity-40 rounded-md transition-colors shadow-xs"
            >
              <Send className="w-3.5 h-3.5 text-[#B29A70]" />
              <span>Perguntar</span>
            </button>
          )}
        </form>
      </div>

      {/* 4. Main Consolidated Diagnosis Section */}
      {error && (
        <div className="p-4 bg-[#F8E8E5] border border-[#EED0CC] rounded-lg text-[#963F36] text-xs">
          {error}
        </div>
      )}

      {loadingDiagnosis ? (
        <div className="p-10 bg-[#FFFFFF] border border-[#E7E1D7] rounded-lg flex items-center justify-center gap-3 text-xs text-[#5F635C]">
          <RefreshCw className="w-4 h-4 text-[#253A32] animate-spin" />
          <span>
            Consolidando motores determinísticos (Caixa + Patrimônio +
            Planejamento) e validando diagnóstico...
          </span>
        </div>
      ) : (
        diag && (
          <div className="space-y-6">
            {/* Fallback / Contingency Notice */}
            {diag.meta.isFallback && (
              <div className="p-4 bg-[#F5EEDB] border border-[#E8DEC7] rounded-lg flex items-start gap-3">
                <Cpu className="w-4 h-4 text-[#795C24] shrink-0 mt-0.5" />
                <div className="text-xs text-[#795C24] space-y-0.5">
                  <p className="font-semibold">
                    Modo de Contingência Determinística Ativo (
                    <span className="font-mono">{diag.meta.modelUsed}</span>)
                  </p>
                  <p className="text-[#5F635C]">
                    {diag.meta.fallbackReason ||
                      'O diagnóstico abaixo foi produzido pelo sintetizador determinístico local do FinAI, garantindo disponibilidade contínua sem perda de precisão contábil.'}
                  </p>
                </div>
              </div>
            )}

            {/* Status & Executive Summary Hero Card */}
            <div className="p-6 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E7E1D7]">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${statusConfig.surface} ${statusConfig.color}`}
                  >
                    <StatusIcon className="w-3.5 h-3.5" />
                    <span>{statusConfig.label}</span>
                  </span>
                  <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-[#777A72]">
                    Diagnóstico Consolidado do Período ({selectedMonth})
                  </span>
                </div>

                <span className="text-[11px] font-mono tabular-nums px-2.5 py-0.5 rounded bg-[#F0EDE6] text-[#5F635C] border border-[#E7E1D7]">
                  Rota: {diag.meta.route} • Modelo: {diag.meta.modelUsed} •{' '}
                  {diag.meta.latencyMs.toFixed(0)}ms
                </span>
              </div>

              <p className="text-sm sm:text-base text-[#242823] font-normal leading-relaxed">
                {diag.summary || diag.diagnostico}
              </p>
            </div>

            {/* Referenced Deterministic Metrics Grid */}
            {diag.referencedMetrics && diag.referencedMetrics.length > 0 && (
              <div className="bg-[#FFFFFF] border border-[#E7E1D7] rounded-lg p-5 shadow-xs space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[11px] font-sans font-semibold uppercase tracking-wider text-[#777A72] flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#245A3C]" /> Base
                    Numérica Determinística Referenciada (Fonte da Verdade)
                  </h3>
                  <span className="text-[11px] text-[#777A72]">
                    Valores auditados sem recálculo por texto livre
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {diag.referencedMetrics.map((m) => (
                    <div
                      key={m.key}
                      className="p-3.5 rounded-md bg-[#F6F3ED] border border-[#E7E1D7] flex flex-col justify-between"
                    >
                      <div>
                        <span className="text-[10px] font-mono uppercase text-[#795C24] block">
                          {SOURCE_ENGINE_LABELS[m.sourceEngine] ||
                            m.sourceEngine}
                        </span>
                        <span className="text-xs text-[#5F635C] block mt-0.5">
                          {m.label}
                        </span>
                      </div>
                      <span className="font-serif text-lg font-bold tabular-nums text-[#242823] mt-1.5 block">
                        {m.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Observations (Epistemic Badges) & Grounded Recommendations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Explainable Observations */}
              <div className="bg-[#FFFFFF] border border-[#E7E1D7] rounded-lg p-5 shadow-xs space-y-4">
                <div className="pb-2.5 border-b border-[#E7E1D7] flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#242823] uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#B29A70]" />
                    <span>Observações Explicáveis (Fatos vs Hipóteses)</span>
                  </h3>
                </div>

                <div className="space-y-3">
                  {diag.observations.map((obs, idx) => {
                    const badge =
                      EPISTEMIC_BADGES[obs.epistemicType] ||
                      EPISTEMIC_BADGES.INTERPRETATION;
                    return (
                      <div
                        key={idx}
                        className="p-3.5 rounded-md bg-[#F6F3ED] border border-[#E7E1D7] space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-bold text-[#242823]">
                            {obs.title}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-xs text-[#5F635C] leading-relaxed">
                          {obs.detail}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actionable Grounded Recommendations */}
              <div className="bg-[#FFFFFF] border border-[#E7E1D7] rounded-lg p-5 shadow-xs space-y-4">
                <div className="pb-2.5 border-b border-[#E7E1D7] flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#242823] uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#B29A70]" />
                    <span>Recomendações Fundamentadas</span>
                  </h3>
                </div>

                <div className="space-y-3">
                  {diag.recommendations.map((rec, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-md bg-[#F6F3ED] border border-[#E7E1D7] space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${
                            rec.priority === 'HIGH'
                              ? 'bg-[#F8E8E5] text-[#963F36] border-[#EED0CC]'
                              : rec.priority === 'MEDIUM'
                                ? 'bg-[#F5EEDB] text-[#795C24] border-[#E8DEC7]'
                                : 'bg-[#E4EFE6] text-[#245A3C] border-[#D1E2D4]'
                          }`}
                        >
                          Prioridade{' '}
                          {rec.priority === 'HIGH'
                            ? 'Alta'
                            : rec.priority === 'MEDIUM'
                              ? 'Média'
                              : 'Baixa'}
                        </span>
                        <span className="text-xs font-mono font-semibold text-[#245A3C] flex items-center">
                          <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                          {rec.impactEstimate}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm font-semibold text-[#242823]">
                        {rec.action}
                      </p>
                      <p className="text-xs text-[#5F635C] leading-relaxed">
                        {rec.rationale}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Limitations & Data Completeness Notes */}
            {diag.limitations && diag.limitations.length > 0 && (
              <div className="p-4 rounded-lg bg-[#F0EDE6] border border-[#D6CFC2] space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#242823]">
                  <HelpCircle className="w-4 h-4 text-[#795C24]" />
                  <span>
                    Limitações Explícitas de Dados e Premissas do Período
                  </span>
                </div>
                <ul className="list-disc list-inside text-xs text-[#5F635C] space-y-1">
                  {diag.limitations.map((lim, i) => (
                    <li key={i}>{lim}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Annual Projection Banner (Institutional Forest Green & Warm Brass) */}
            <div className="p-6 rounded-lg bg-[#253A32] border border-[#1B2B25] text-[#FFFFFF] shadow-xs">
              <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-[#B29A70] mb-1">
                Projeção Prospectiva & Simulação Anualizada
              </div>
              <p className="font-serif text-lg sm:text-xl text-[#FFFFFF] leading-relaxed">
                {diag.ProjecaoAnual}
              </p>
            </div>
          </div>
        )
      )}
    </div>
  );
}
