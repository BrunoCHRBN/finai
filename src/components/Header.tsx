'use client';

import React from 'react';
import { 
  RefreshCw, 
  Sparkles, 
  Plus, 
  Calendar, 
  Wallet, 
  Clock, 
  TrendingUp,
  Search
} from 'lucide-react';
import { FinancialMetrics } from '@/lib/ai/math-engine';

interface HeaderProps {
  metrics: FinancialMetrics | null;
  currentMonth: string;
  isSyncingPluggy: boolean;
  isGeneratingAI: boolean;
  onSyncPluggy: () => void;
  onRunAIDiagnosis: () => void;
  onOpenNewTxModal: () => void;
  onOpenCommandPalette: () => void;
}

export function Header({
  metrics,
  currentMonth,
  isSyncingPluggy,
  isGeneratingAI,
  onSyncPluggy,
  onRunAIDiagnosis,
  onOpenNewTxModal,
  onOpenCommandPalette,
}: HeaderProps) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const getRunwayColor = (months: number) => {
    if (months >= 6) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (months >= 3) return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
    if (months >= 1) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
  };

  return (
    <header className="h-16 border-b border-[#1e2634] bg-[#0c0f14]/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Left: Month indicator & Search shortcut */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1e2634] bg-[#12161f] text-xs font-mono font-medium text-slate-300">
          <Calendar className="w-3.5 h-3.5 text-emerald-400" />
          <span>Outubro 2026 ({currentMonth})</span>
        </div>

        {/* Quick Search Button */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1e2634] bg-[#12161f] text-xs text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-all"
        >
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <span>Buscar ou comandar...</span>
          <kbd className="text-[10px] bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-slate-400 font-mono">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Center: Realtime Desktop KPIs */}
      {metrics && (
        <div className="hidden lg:flex items-center gap-6">
          {/* Liquid Balance */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Wallet className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-mono text-slate-400">Saldo Líquido</div>
              <div className="text-xs font-mono font-bold text-white tabular-nums">
                {formatCurrency(metrics.totalLiquidBalance)}
              </div>
            </div>
          </div>

          {/* Runway */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-mono text-slate-400">Runway</div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono font-bold text-white tabular-nums">
                  {metrics.runwayMonths} meses
                </span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${getRunwayColor(metrics.runwayMonths)}`}>
                  {metrics.runwayMonths >= 6 ? 'Seguro' : metrics.runwayMonths >= 3 ? 'Médio' : 'Crítico'}
                </span>
              </div>
            </div>
          </div>

          {/* Savings Rate */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-mono text-slate-400">Taxa Poupança</div>
              <div className="text-xs font-mono font-bold text-blue-400 tabular-nums">
                {metrics.savingsRatePct}% da renda
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Right: Actions */}
      <div className="flex items-center gap-2.5">
        {/* Sync Pluggy Button */}
        <button
          onClick={onSyncPluggy}
          disabled={isSyncingPluggy}
          title="Sincronizar contas bancárias via Pluggy Open Finance"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1e2634] bg-[#12161f] text-xs font-medium text-slate-300 hover:text-white hover:border-slate-700 hover:bg-[#161b26] transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-teal-400 ${isSyncingPluggy ? 'animate-spin' : ''}`} />
          <span>{isSyncingPluggy ? 'Sincronizando...' : 'Sync Pluggy'}</span>
        </button>

        {/* AI Diagnosis Button */}
        <button
          onClick={onRunAIDiagnosis}
          disabled={isGeneratingAI}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-gradient-to-r from-emerald-600/30 to-teal-600/30 text-emerald-300 text-xs font-medium hover:from-emerald-600/50 hover:to-teal-600/50 transition-all shadow-sm shadow-emerald-500/10 disabled:opacity-50"
        >
          <Sparkles className={`w-3.5 h-3.5 text-emerald-400 ${isGeneratingAI ? 'animate-spin' : ''}`} />
          <span>{isGeneratingAI ? 'Analisando...' : 'Diagnóstico IA'}</span>
          <span className="text-[9px] bg-emerald-500/20 px-1 py-0.5 rounded font-mono border border-emerald-500/30">
            &lt; 200 tok
          </span>
        </button>

        {/* Add Transaction Button */}
        <button
          onClick={onOpenNewTxModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition-all shadow-md shadow-emerald-500/20"
        >
          <Plus className="w-3.5 h-3.5 text-slate-950" />
          <span>Novo Gasto</span>
        </button>
      </div>
    </header>
  );
}
