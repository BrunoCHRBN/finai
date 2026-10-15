'use client';

import React from 'react';
import { 
  Sparkles, 
  ShieldCheck, 
  Target, 
  ArrowRight, 
  Cpu, 
  Layers, 
  CheckCircle2, 
  Clock,
  Compass
} from 'lucide-react';
import { FinancialMetrics } from '@/lib/ai/math-engine';

interface CopilotViewProps {
  metrics: FinancialMetrics;
  diagnosis: any;
  onRunDiagnosis: () => void;
  isGenerating: boolean;
}

export function CopilotView({ metrics, diagnosis, onRunDiagnosis, isGenerating }: CopilotViewProps) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const maturityLevels = [
    {
      level: 1,
      title: 'Sobrevivência & Estabilização',
      goal: 'Estancar vazamentos, quitar dívidas de alto custo e criar o primeiro colchão de R$ 1.000 a 1 mês.',
      milestones: ['Runway < 1 mês', 'Fluxo de caixa apertado', 'Foco em corte de gargalos'],
      color: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
    },
    {
      level: 2,
      title: 'Construção da Base',
      goal: 'Completar 3 a 6 meses de reserva de emergência em liquidez imediata e estabilizar a Taxa de Poupança acima de 20%.',
      milestones: ['Runway de 1 a 5 meses', 'Orçamento previsível', 'Reserva de emergência ativa'],
      color: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
    },
    {
      level: 3,
      title: 'Acumulador Ativo',
      goal: 'Diversificação de patrimônio, aportes automáticos mensais em Renda Fixa e Variável, foco em custo de oportunidade.',
      milestones: ['Runway >= 6 meses', 'Taxa de poupança consistente > 20%', 'Investimento recorrente'],
      color: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400',
    },
    {
      level: 4,
      title: 'Investidor Consolidado',
      goal: 'Eficiência fiscal, reinvestimento de dividendos e renda passiva cobrindo despesas essenciais.',
      milestones: ['Patrimônio gerando renda passiva', 'Gestão de risco de cauda', 'Blindagem patrimonial'],
      color: 'border-purple-500/30 bg-purple-500/5 text-purple-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Copilot Header */}
      <div className="p-6 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-[#0c141c] to-[#0f1319] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 mb-1">
            <Sparkles className="w-4 h-4" />
            <span>Mentor Financeiro Adaptativo (Token-Light Architecture)</span>
          </div>
          <h2 className="text-lg font-bold text-white">
            Trilha de Evolução Patrimonial por Níveis
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            A IA não te dá conselhos genéricos. Suas recomendações mudam radicalmente conforme você sobe de nível, do estancamento de sangrias até a alocação avançada.
          </p>
        </div>

        <button
          onClick={onRunDiagnosis}
          disabled={isGenerating}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
        >
          <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
          <span>{isGenerating ? 'Gerando Diagnóstico...' : 'Rodar Novo Diagnóstico'}</span>
        </button>
      </div>

      {/* The 4 Maturity Levels Timeline */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
          Os 4 Estágios de Maturidade Financeira
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {maturityLevels.map((lvl) => {
            const isCurrent = metrics.maturityLevel === lvl.level;
            const isCompleted = metrics.maturityLevel > lvl.level;

            return (
              <div
                key={lvl.level}
                className={`p-4 rounded-xl border flex flex-col justify-between transition-all relative ${
                  isCurrent
                    ? 'border-emerald-500 bg-[#131b26] shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/50'
                    : isCompleted
                    ? 'border-slate-800 bg-[#0f1319]/80 opacity-80'
                    : 'border-[#1e2634] bg-[#0f1319] opacity-60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${lvl.color}`}>
                      NÍVEL {lvl.level}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 font-mono">
                        <CheckCircle2 className="w-3 h-3" /> VOCÊ ESTÁ AQUI
                      </span>
                    )}
                    {isCompleted && (
                      <span className="text-[10px] text-slate-400 font-mono">✓ CONCLUÍDO</span>
                    )}
                  </div>

                  <div className="text-xs font-bold text-white mb-1.5">{lvl.title}</div>
                  <p className="text-[11px] text-slate-300 leading-relaxed mb-3">{lvl.goal}</p>
                </div>

                <div className="pt-2.5 border-t border-[#1e2634]/60 space-y-1">
                  {lvl.milestones.map((m, idx) => (
                    <div key={idx} className="text-[10px] text-slate-400 flex items-center gap-1.5">
                      <div className="w-1 h-1 rounded-full bg-slate-500" />
                      <span>{m}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Current Diagnosis Deep Dive */}
      {diagnosis && (
        <div className="p-6 rounded-2xl border border-[#1e2634] bg-[#0f1319] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">
                Diagnóstico & Plano Tático Atual
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              <span>Custo desta consulta: <strong className="text-white">{diagnosis.tokenCount || 215} tokens</strong></span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#12161f] border border-[#1e2634]">
            <div className="text-xs font-bold text-emerald-400 mb-1">{diagnosis.headline}</div>
            <p className="text-xs text-slate-200 leading-relaxed">{diagnosis.summary}</p>
          </div>

          {diagnosis.priorityActions && diagnosis.priorityActions.length > 0 && (
            <div>
              <div className="text-xs font-bold text-slate-300 mb-2 font-mono uppercase tracking-wider">
                Passo a Passo de Execução:
              </div>
              <div className="space-y-2">
                {diagnosis.priorityActions.map((action: any, i: number) => (
                  <div key={i} className="p-3 rounded-lg border border-[#1e2634] bg-[#12161f] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        {i + 1}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white">{action.title}</div>
                        <div className="text-[11px] text-slate-400">Categoria: {action.category}</div>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
                      {action.impact}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
