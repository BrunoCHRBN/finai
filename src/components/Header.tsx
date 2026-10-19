'use client';

import React from 'react';
import { 
  RefreshCw, 
  ChartNoAxesCombined, 
  Plus, 
  Search,
  Menu
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
  onToggleMobileMenu?: () => void;
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
  onToggleMobileMenu,
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

  // Runway reliability check: only show if fixed expenses are substantial
  const hasReliableRunway = metrics && metrics.fixedExpenses > 50 && metrics.runwayMonths > 0;

  return (
    <header className="h-16 border-b border-[#E7E1D7] bg-[#FFFFFF] px-3.5 sm:px-6 flex items-center justify-between gap-2.5 sm:gap-4 sticky top-0 z-20 shrink-0">
      {/* Left: Mobile Menu Trigger & Period Title */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            aria-label="Abrir menu de navegação"
            className="lg:hidden p-2 -ml-1 text-[#5F635C] hover:text-[#242823] hover:bg-[#F3F1EB] rounded-md transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-xs sm:text-sm font-semibold text-[#242823] font-sans">
            {formatPeriodName(currentMonth)}
          </span>
        </div>

        {/* Command Palette Trigger */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Buscar lançamentos (Ctrl+K)"
          title="Buscar lançamentos (Ctrl+K)"
          className="flex h-9 items-center gap-1.5 sm:gap-2 px-2 sm:px-3 rounded-md bg-[#FAF8F5] border border-[#E7E1D7] text-xs text-[#5F635C] transition-colors hover:text-[#242823] hover:border-[#D6CFC2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#253A32] cursor-pointer"
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-[#777A72]" />
          <span className="hidden md:inline">Buscar lançamentos</span>
          <kbd className="hidden lg:inline-flex text-[10px] text-[#777A72] font-mono px-1 py-0.5 rounded bg-[#F0EDE6] border border-[#E7E1D7]">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* Center / Right Secondary: Runway Indicator (Desktop only if reliable) */}
      <div className="hidden xl:flex items-center text-xs font-sans text-[#5F635C]">
        {hasReliableRunway && (
          <div className="flex items-center gap-2 px-3 py-1 rounded bg-[#F6F3ED] border border-[#E7E1D7]">
            <span className="text-[#777A72]">Fôlego Estimado:</span>
            <span className="font-semibold text-[#242823] font-mono tabular-nums">
              {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(metrics.runwayMonths)} meses
            </span>
          </div>
        )}
      </div>

      {/* Right: Actions Cluster */}
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {/* Sync Button */}
        <button
          type="button"
          onClick={onSyncPluggy}
          disabled={isSyncingPluggy}
          title={isSyncingPluggy ? 'Sincronizando contas' : 'Sincronizar Open Finance'}
          aria-label={isSyncingPluggy ? 'Sincronizando contas' : 'Sincronizar Open Finance'}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-[#E7E1D7] text-[#5F635C] hover:bg-[#F3F1EB] hover:text-[#242823] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#253A32] disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${isSyncingPluggy ? 'animate-spin text-[#253A32]' : ''}`} />
        </button>

        {/* AI Diagnosis Button */}
        <button
          type="button"
          onClick={onRunAIDiagnosis}
          disabled={isGeneratingAI}
          title="Gerar diagnóstico analítico"
          className="flex h-9 items-center gap-1.5 rounded-md border border-[#D6CFC2] bg-[#FFFFFF] px-2.5 sm:px-3 text-xs font-medium text-[#242823] transition-colors hover:bg-[#F3F1EB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#253A32] disabled:opacity-50 cursor-pointer"
        >
          <ChartNoAxesCombined className={`h-3.5 w-3.5 text-[#253A32] ${isGeneratingAI ? 'animate-pulse' : ''}`} />
          <span className="hidden sm:inline">{isGeneratingAI ? 'Analisando...' : 'Diagnosticar'}</span>
        </button>

        {/* Primary Action Button: Registrar Lançamento */}
        <button
          type="button"
          onClick={onOpenNewTxModal}
          className="flex h-9 items-center gap-1.5 rounded-md bg-[#253A32] px-3 sm:px-3.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#1B2B25] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#253A32] cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden xs:inline sm:inline">Registrar</span>
        </button>
      </div>
    </header>
  );
}
