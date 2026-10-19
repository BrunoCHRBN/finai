'use client';

import React from 'react';
import { 
  RefreshCw, 
  ChartNoAxesCombined, 
  Plus, 
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
  // Format currentMonth (e.g., '2026-10' -> 'Outubro de 2026')
  const formatPeriodName = (periodStr: string) => {
    try {
      const [year, month] = periodStr.split('-');
      if (!year || !month) return periodStr;
      const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
      return monthName.charAt(0).toUpperCase() + monthName.slice(1);
    } catch {
      return periodStr;
    }
  };

  return (
    <header className="h-16 border-b border-[#E7E1D7] bg-[#FFFFFF] px-4 md:px-6 flex items-center justify-between gap-3 sticky top-0 z-20 shrink-0">
      <div className="flex min-w-0 items-center gap-3 md:gap-5">
        <span className="hidden sm:inline whitespace-nowrap text-sm font-medium text-[#242823]">
          {formatPeriodName(currentMonth)}
        </span>

        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Buscar lançamentos (Ctrl+K)"
          title="Buscar lançamentos (Ctrl+K)"
          className="flex h-9 items-center gap-2 text-xs text-[#5F635C] transition-colors hover:text-[#242823] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#253A32]"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Buscar lançamentos</span>
          <kbd className="hidden md:inline-flex text-[10px] text-[#777A72] font-mono">
            Ctrl K
          </kbd>
        </button>
      </div>

      <div className="hidden 2xl:flex items-center text-xs font-sans text-[#5F635C]">
        {metrics && (
          <div className="flex items-center gap-2">
            <span className="text-[#777A72]">Fôlego</span>
            <span className="font-semibold text-[#242823] font-mono tabular-nums">
              {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(metrics.runwayMonths)} meses
            </span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={onSyncPluggy}
          disabled={isSyncingPluggy}
          title={isSyncingPluggy ? 'Sincronizando contas' : 'Atualizar contas'}
          aria-label={isSyncingPluggy ? 'Sincronizando contas' : 'Atualizar contas'}
          className="flex h-9 w-9 items-center justify-center rounded-md text-[#5F635C] transition-colors hover:bg-[#F3F1EB] hover:text-[#242823] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#253A32] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isSyncingPluggy ? 'animate-spin' : ''}`} />
        </button>

        <button
          type="button"
          onClick={onRunAIDiagnosis}
          disabled={isGeneratingAI}
          title="Gerar diagnóstico de liquidez e solvência"
          className="flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[#242823] transition-colors hover:bg-[#F3F1EB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#253A32] disabled:opacity-50 sm:px-3"
        >
          <ChartNoAxesCombined className={`h-3.5 w-3.5 text-[#253A32] ${isGeneratingAI ? 'animate-pulse' : ''}`} />
          <span className="hidden sm:inline">{isGeneratingAI ? 'Analisando...' : 'Diagnosticar'}</span>
          <span className="sr-only sm:hidden">{isGeneratingAI ? 'Analisando' : 'Diagnosticar'}</span>
        </button>

        <button
          type="button"
          onClick={onOpenNewTxModal}
          className="flex h-9 items-center gap-1.5 rounded-md bg-[#253A32] px-2.5 text-xs font-medium text-white transition-colors hover:bg-[#1B2B25] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#253A32] sm:px-3.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Registrar</span>
          <span className="sr-only sm:hidden">Registrar</span>
        </button>
      </div>
    </header>
  );
}
