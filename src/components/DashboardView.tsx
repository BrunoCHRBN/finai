'use client';

import React from 'react';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  TrendingUp, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle,
  Sparkles,
  Target,
  Cpu,
  BarChart3,
  Layers
} from 'lucide-react';
import { FinancialMetrics } from '@/lib/ai/math-engine';

interface DashboardViewProps {
  metrics: FinancialMetrics;
  diagnosis: any;
  goals: any[];
  onOpenNewTxModal: () => void;
  onOpenAIDiagnosis: () => void;
}

export function DashboardView({
  metrics,
  diagnosis,
  goals,
  onOpenNewTxModal,
  onOpenAIDiagnosis,
}: DashboardViewProps) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Status badge config
  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    OPTIMAL: { label: 'Superávit Seguro', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: CheckCircle2 },
    ATTENTION: { label: 'Ajuste de Gastos', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: AlertTriangle },
    CRITICAL: { label: 'Déficit de Caixa', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30', icon: ShieldAlert },
  };

  const currentStatus = statusConfig[diagnosis?.status] || statusConfig['ATTENTION'];
  const StatusIcon = currentStatus.icon;

  return (
    <div className="space-y-6">
      {/* 1. TOP CARDS: Cash Flow & Financial Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Incomes */}
        <div className="p-4 rounded-xl border border-[#1e2634] bg-[#0f1319] hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Entradas do Mês</span>
            <div className="p-1 rounded bg-emerald-500/10 text-emerald-400">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
            {formatCurrency(metrics.totalIncome)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1 font-mono">
            <span>Outubro 2026</span>
          </div>
        </div>

        {/* Expenses */}
        <div className="p-4 rounded-xl border border-[#1e2634] bg-[#0f1319] hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Gastos do Mês</span>
            <div className="p-1 rounded bg-rose-500/10 text-rose-400">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold font-mono text-rose-400 tabular-nums">
            {formatCurrency(metrics.totalExpenses)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Fixos: {formatCurrency(metrics.fixedExpenses)}</span>
            <span>Variáveis: {formatCurrency(metrics.variableExpenses)}</span>
          </div>
        </div>

        {/* Net Cash Flow */}
        <div className="p-4 rounded-xl border border-[#1e2634] bg-[#0f1319] hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Sobra Mensal</span>
            <div className="p-1 rounded bg-blue-500/10 text-blue-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-xl font-bold font-mono tabular-nums ${metrics.netCashFlow >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
            {formatCurrency(metrics.netCashFlow)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Poupança: <span className="font-semibold text-white">{metrics.savingsRatePct}% da renda</span>
          </div>
        </div>

        {/* Runway */}
        <div className="p-4 rounded-xl border border-[#1e2634] bg-[#0f1319] hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Meses de Caixa Coberto</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {metrics.runwayMonths >= 6 ? 'Tranquilo' : 'Apertado'}
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-white tabular-nums">
            {metrics.runwayMonths} meses
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div 
              className={`h-1.5 rounded-full ${metrics.runwayMonths >= 6 ? 'bg-emerald-500' : metrics.runwayMonths >= 3 ? 'bg-blue-500' : 'bg-amber-500'}`}
              style={{ width: `${Math.min(100, (metrics.runwayMonths / 6) * 100)}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Custo fixo 6 meses: {formatCurrency(metrics.fixedExpenses * 6)}
          </div>
        </div>
      </div>

      {/* 2. AI DIAGNOSIS & TOKEN EFFICIENCY SPOTLIGHT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: AI Diagnosis Card (2 cols) */}
        <div className="lg:col-span-2 p-5 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-[#0c141c] to-[#0f1319] shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Sparkles className="w-32 h-32 text-emerald-400" />
          </div>

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 font-mono">
                  Diagnóstico do Mês
                </span>
                <span className="ml-2 text-[10px] text-slate-400 font-mono">
                  {diagnosis?.modelUsed || 'gemini-flash-lite'}
                </span>
              </div>
            </div>

            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${currentStatus.color}`}>
              <StatusIcon className="w-3.5 h-3.5" />
              <span>{currentStatus.label}</span>
            </div>
          </div>

          {/* Headline & Summary */}
          <h3 className="text-base font-bold text-white mb-2">
            {diagnosis?.headline || 'Avaliação de Liquidez e Gastos'}
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed mb-4">
            {diagnosis?.summary || 'Clique em "Diagnóstico IA" para avaliar o fechamento parcial deste mês.'}
          </p>

          {/* Priority Actions */}
          {diagnosis?.priorityActions && diagnosis.priorityActions.length > 0 && (
            <div className="space-y-2 mb-4">
              <div className="text-[11px] font-mono uppercase text-slate-400 tracking-wider">
                Ajustes Práticos:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {diagnosis.priorityActions.map((action: any, i: number) => (
                  <div key={i} className="p-2.5 rounded-lg border border-[#1e2634] bg-[#121620] flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-200">{action.title}</div>
                      <div className="text-[10px] text-emerald-400 font-mono mt-0.5">{action.impact}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next Milestone */}
          {diagnosis?.nextMilestone && (
            <div className="pt-3 border-t border-[#1e2634] flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-blue-400" />
                Meta Imediata: <span className="text-slate-200 font-medium">{diagnosis.nextMilestone}</span>
              </span>
              <button
                onClick={onOpenAIDiagnosis}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium underline underline-offset-4"
              >
                Recalcular
              </button>
            </div>
          )}
        </div>

        {/* Right: Token-Efficiency Architecture Badge (1 col) */}
        <div className="p-5 rounded-2xl border border-[#1e2634] bg-[#0f1319] flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
                <Cpu className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-white">Controle de Tokens</div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-[#141822] border border-[#1e2634]">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Motor Determinístico</span>
                  <span className="text-emerald-400 font-mono font-bold">0 Tokens</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Somas e desvios rodam no servidor local; custo zero de API.
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#141822] border border-[#1e2634]">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Carga do Prompt</span>
                  <span className="text-blue-400 font-mono font-bold">&lt; 180 Tokens</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  O modelo recebe apenas o resumo consolidado do mês, sem despejar centenas de linhas de extrato.
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#141822] border border-[#1e2634]">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Gasto da Última Chamada</span>
                  <span className="text-purple-400 font-mono font-bold">
                    {diagnosis?.tokenCount || 215} tokens
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Menos de meio centavo por análise completa.
                </div>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 pt-3 border-t border-[#1e2634] flex items-center justify-between">
            <span>Privacidade local</span>
            <span className="text-slate-400">Extrato bruto não sai da máquina</span>
          </div>
        </div>
      </div>

      {/* 3. RULE 50/30/20 & CAPITAL ACCUMULATION GOALS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 50 / 30 / 20 Budget Distribution */}
        <div className="p-5 rounded-2xl border border-[#1e2634] bg-[#0f1319]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Regra 50 / 30 / 20 (Alocação da Renda)
              </h4>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">Meta vs Real</span>
          </div>

          {/* Comparative Distribution Bar */}
          <div className="w-full h-4 rounded-full bg-slate-800 flex overflow-hidden mb-3">
            <div 
              style={{ width: `${metrics.fixedPct}%` }} 
              className="bg-blue-500 hover:opacity-90 transition-all" 
              title={`Necessidades Fixas: ${metrics.fixedPct}%`}
            />
            <div 
              style={{ width: `${metrics.variablePct}%` }} 
              className="bg-amber-500 hover:opacity-90 transition-all" 
              title={`Estilo de Vida: ${metrics.variablePct}%`}
            />
            <div 
              style={{ width: `${metrics.investmentPct}%` }} 
              className="bg-emerald-500 hover:opacity-90 transition-all" 
              title={`Aportes/Investimentos: ${metrics.investmentPct}%`}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-lg bg-[#12161f] border border-[#1e2634]">
              <div className="text-[10px] text-blue-400 font-mono font-semibold">50% Fixos / Essencial</div>
              <div className="text-sm font-bold font-mono text-white mt-0.5">{metrics.fixedPct}%</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{formatCurrency(metrics.fixedExpenses)}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#12161f] border border-[#1e2634]">
              <div className="text-[10px] text-amber-400 font-mono font-semibold">30% Estilo de Vida</div>
              <div className="text-sm font-bold font-mono text-white mt-0.5">{metrics.variablePct}%</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{formatCurrency(metrics.variableExpenses)}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#12161f] border border-[#1e2634]">
              <div className="text-[10px] text-emerald-400 font-mono font-semibold">20% Aporte / Acúmulo</div>
              <div className="text-sm font-bold font-mono text-white mt-0.5">{metrics.investmentPct}%</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{formatCurrency(metrics.investmentAmount)}</div>
            </div>
          </div>
        </div>

        {/* Capital Accumulation Goals */}
        <div className="p-5 rounded-2xl border border-[#1e2634] bg-[#0f1319]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Acúmulo de Capital & Metas
              </h4>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">{goals.length} metas ativas</span>
          </div>

          <div className="space-y-3">
            {goals.map((goal) => {
              const progress = Math.min(100, Math.round((goal.currentAmount / (goal.targetAmount || 1)) * 100));
              return (
                <div key={goal.id} className="p-3 rounded-lg border border-[#1e2634] bg-[#12161f]">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-slate-200">{goal.title}</span>
                    <span className="font-mono text-emerald-400 font-bold">{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 mb-1.5 overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-1.5 rounded-full" 
                      style={{ width: `${progress}%` }} 
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>Atual: {formatCurrency(goal.currentAmount)}</span>
                    <span>Alvo: {formatCurrency(goal.targetAmount)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
