'use client';

import React from 'react';
import { 
  RefreshCw, 
  Sparkles, 
  Plus, 
  Calendar, 
  Search,
  CheckCircle2
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
    <header className="h-16 border-b border-[#E7E1D7] bg-[#FFFFFF] px-6 flex items-center justify-between sticky top-0 z-20 shrink-0">
      {/* Left: Dynamic Period Indicator & Search Button */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#E7E1D7] bg-[#F6F3ED] text-xs font-sans font-medium text-[#242823]">
          <Calendar className="w-3.5 h-3.5 text-[#253A32]" />
          <span>{formatPeriodName(currentMonth)}</span>
        </div>

        <button
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-md border border-[#E7E1D7] bg-[#FFFFFF] text-xs font-sans text-[#5F635C] hover:text-[#242823] hover:border-[#D6CFC2] hover:bg-[#F3F1EB] transition-colors"
        >
          <Search className="w-3.5 h-3.5 text-[#777A72]" />
          <span>Buscar ou comandar...</span>
          <kbd className="text-[10px] bg-[#F0EDE6] border border-[#E7E1D7] px-1.5 py-0.5 rounded text-[#5F635C] font-mono">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Center: Subtle Institutional Status */}
      <div className="hidden xl:flex items-center gap-5 text-xs font-sans text-[#5F635C]">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#245A3C]" />
          <span>Dados Reconciliados (C6 Bank & Itaú)</span>
        </div>
        {metrics && (
          <div className="flex items-center gap-2 border-l border-[#E7E1D7] pl-4">
            <span className="text-[#777A72]">Runway:</span>
            <span className="font-semibold text-[#242823] font-mono tabular-nums">
              {metrics.runwayMonths} meses
            </span>
          </div>
        )}
      </div>

      {/* Right: Operational Actions */}
      <div className="flex items-center gap-2">
        {/* Sync Open Finance */}
        <button
          onClick={onSyncPluggy}
          disabled={isSyncingPluggy}
          title="Sincronizar movimentações via Pluggy v2"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#E7E1D7] bg-[#FFFFFF] text-xs font-sans font-medium text-[#242823] hover:bg-[#F3F1EB] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#5F635C] ${isSyncingPluggy ? 'animate-spin' : ''}`} />
          <span>{isSyncingPluggy ? 'Sincronizando...' : 'Atualizar'}</span>
        </button>

        {/* AI Diagnosis */}
        <button
          onClick={onRunAIDiagnosis}
          disabled={isGeneratingAI}
          title="Gerar diagnóstico de liquidez e solvência com Gemini Flash Lite"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#D6CFC2] bg-[#F5EEDB] text-[#795C24] text-xs font-sans font-medium hover:bg-[#EFE5CD] transition-colors disabled:opacity-50"
        >
          <Sparkles className={`w-3.5 h-3.5 text-[#B29A70] ${isGeneratingAI ? 'animate-spin' : ''}`} />
          <span>{isGeneratingAI ? 'Analisando...' : 'Diagnóstico IA'}</span>
        </button>

        {/* New Transaction */}
        <button
          onClick={onOpenNewTxModal}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#253A32] hover:bg-[#1B2B25] text-white text-xs font-sans font-medium transition-colors shadow-xs"
        >
          <Plus className="w-3.5 h-3.5 text-white" />
          <span>Registrar</span>
        </button>
      </div>
    </header>
  );
}
