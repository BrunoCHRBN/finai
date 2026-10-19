'use client';

import React from 'react';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  TrendingUp, 
  CheckCircle2, 
  AlertTriangle,
  ShieldAlert,
  Sparkles,
  PieChart,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Clock,
  Calendar,
  Layers,
  Receipt,
  HelpCircle
} from 'lucide-react';
import { FinancialMetrics } from '@/lib/ai/math-engine';
import { PageHeader } from './ui/PageHeader';
import { StatusBadge } from './ui/StatusBadge';
import { MetricCard } from './ui/MetricCard';

interface DashboardViewProps {
  metrics: FinancialMetrics;
  diagnosis: any;
  goals: any[];
  cashFlowProjection?: any;
  recentTransactions?: any[];
  currentMonth?: string;
  onOpenNewTxModal: () => void;
  onOpenAIDiagnosis: () => void;
  onSelectTab?: (tab: string) => void;
}

export function DashboardView({
  metrics,
  diagnosis,
  cashFlowProjection,
  recentTransactions = [],
  currentMonth = '2026-10',
  onOpenNewTxModal,
  onOpenAIDiagnosis,
  onSelectTab,
}: DashboardViewProps) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

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

  const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'danger'; icon: any }> = {
    OPTIMAL: { label: 'Superávit Estável', variant: 'success', icon: CheckCircle2 },
    ATTENTION: { label: 'Atenção Orçamentária', variant: 'warning', icon: AlertTriangle },
    CRITICAL: { label: 'Déficit de Caixa', variant: 'danger', icon: ShieldAlert },
  };

  const currentStatus = statusConfig[diagnosis?.status] || statusConfig['ATTENTION'];
  const StatusIcon = currentStatus.icon;

  // Runway reliability: if fixed expenses are minimal or less than 10% of total expenses,
  // the mathematical runway is distorted (e.g. R$ 295 / R$ 6.99 = 42 months)
  const isRunwayIncomplete = metrics.fixedExpenses < 50 || (metrics.totalExpenses > 0 && (metrics.fixedExpenses / metrics.totalExpenses) < 0.10);

  // 50/30/20 canonical calculation
  const fixedDeviation = Math.round(metrics.fixedPct - 50);
  const variableDeviation = Math.round(metrics.variablePct - 30);
  const investmentDeviation = Math.round(metrics.investmentPct - 20);
  const totalAllocatedPct = metrics.fixedPct + metrics.variablePct + metrics.investmentPct;
  const unallocatedPct = Math.max(0, 100 - totalAllocatedPct);

  // Cash flow horizons from cashFlowProjection
  const horizons = cashFlowProjection?.horizonSummaries;
  const h30 = horizons?.days30;
  const h60 = horizons?.days60;
  const h90 = horizons?.days90;

  return (
    <div className="space-y-6 font-sans">
      {/* 1. Page Header with Editorial Hierarchy */}
      <PageHeader
        kicker="Gestão Patrimonial & Fluxo de Caixa"
        title="Visão Geral Consolidada"
        description={`Balanço e execução financeira apurados para ${formatPeriodName(currentMonth)} com reconciliação contábil estrita.`}
        badge={
          <StatusBadge
            variant={currentStatus.variant}
            label={currentStatus.label}
            icon={StatusIcon}
          />
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenAIDiagnosis}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#D6CFC2] bg-[#FFFFFF] hover:bg-[#F3F1EB] text-xs font-sans font-medium text-[#242823] transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#B29A70]" />
              <span className="hidden sm:inline">Diagnóstico IA</span>
            </button>
            <button
              onClick={onOpenNewTxModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#253A32] hover:bg-[#1B2B25] text-xs font-sans font-semibold text-white shadow-xs transition-colors cursor-pointer"
            >
              <span>+ Lançamento</span>
            </button>
          </div>
        }
      />

      {/* 2. Core Operational KPIs (4 equal responsive pillars) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Saldo Disponível */}
        <MetricCard
          label="Saldo Disponível em Caixa"
          badge={
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F0EDE6] text-[#5F635C] border border-[#E7E1D7]">
              Imediato
            </span>
          }
          value={formatCurrency(metrics.totalLiquidBalance)}
          valueClassName="text-[#242823]"
          subtext="Contas correntes ativas conciliadas"
          footer={
            <div className="flex items-center justify-between text-[#5F635C] text-[11px]">
              <span>Base verificada:</span>
              <span className="font-mono font-medium text-[#242823]">Open Finance</span>
            </div>
          }
        />

        {/* Entradas Realizadas */}
        <MetricCard
          label="Entradas Realizadas"
          icon={
            <div className="p-1 rounded bg-[#E4EFE6] text-[#245A3C]">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          }
          value={formatCurrency(metrics.totalIncome)}
          valueClassName="text-[#245A3C]"
          subtext="Receitas do período (exclui transferências próprias)"
          footer={
            <div className="flex items-center justify-between text-[#5F635C] text-[11px]">
              <span>Competência:</span>
              <span className="font-mono text-[#245A3C] font-semibold">{currentMonth}</span>
            </div>
          }
        />

        {/* Despesas Realizadas */}
        <MetricCard
          label="Despesas Totais"
          icon={
            <div className="p-1 rounded bg-[#F8E8E5] text-[#963F36]">
              <ArrowDownRight className="w-3.5 h-3.5" />
            </div>
          }
          value={formatCurrency(metrics.totalExpenses)}
          valueClassName="text-[#963F36]"
          subtext={`Fixas: ${formatCurrency(metrics.fixedExpenses)} | Var.: ${formatCurrency(metrics.variableExpenses)}`}
          footer={
            <div className="flex items-center justify-between text-[#5F635C] text-[11px]">
              <span>Fixas / Variáveis:</span>
              <span className="font-mono text-[#5F635C]">
                {metrics.fixedPct}% / {metrics.variablePct}%
              </span>
            </div>
          }
        />

        {/* Resultado Líquido */}
        <MetricCard
          label="Resultado Líquido do Mês"
          icon={
            <div className={`p-1 rounded ${metrics.netCashFlow >= 0 ? 'bg-[#E4EFE6] text-[#245A3C]' : 'bg-[#F8E8E5] text-[#963F36]'}`}>
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          }
          value={formatCurrency(metrics.netCashFlow)}
          valueClassName={metrics.netCashFlow >= 0 ? 'text-[#245A3C]' : 'text-[#963F36]'}
          subtext={metrics.netCashFlow >= 0 ? 'Superávit operacional livre' : 'Pressão de caixa no período'}
          footer={
            <div className="flex items-center justify-between text-[#5F635C] text-[11px]">
              <span>Taxa de Poupança:</span>
              <span className="font-mono font-semibold text-[#242823]">{metrics.savingsRatePct}%</span>
            </div>
          }
        />
      </div>

      {/* 3. Fôlego Financeiro (Audited Status) */}
      <div className="p-4 sm:p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-md shrink-0 mt-0.5 ${isRunwayIncomplete ? 'bg-[#F5EEDB] text-[#795C24]' : 'bg-[#E4EFE6] text-[#245A3C]'}`}>
              {isRunwayIncomplete ? <AlertCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-base font-bold text-[#242823]">
                  Fôlego Financeiro (Runway)
                </h3>
                {isRunwayIncomplete ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F5EEDB] text-[#795C24] border border-[#E8DEC7] font-semibold">
                    Dados Incompletos
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#E4EFE6] text-[#245A3C] border border-[#D1E2D4] font-semibold">
                    Auditado
                  </span>
                )}
              </div>
              <p className="text-xs text-[#5F635C] font-sans mt-0.5 leading-relaxed">
                {isRunwayIncomplete
                  ? `Foram classificadas apenas ${formatCurrency(metrics.fixedExpenses)} em despesas essenciais fixas neste mês contra ${formatCurrency(metrics.variableExpenses)} em variáveis. Para um cálculo fidedigno de fôlego, registre despesas fixas ou classifique os lançamentos na aba Movimentações.`
                  : `Com o saldo líquido atual de ${formatCurrency(metrics.totalLiquidBalance)} e despesas essenciais de ${formatCurrency(metrics.fixedExpenses)}/mês, suas reservas cobrem ${metrics.runwayMonths} meses de subsistência.`}
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right shrink-0 pl-11 sm:pl-0">
            <div className="text-[11px] font-sans text-[#777A72]">Runway Apurado</div>
            <div className={`font-serif text-2xl font-bold tabular-nums ${isRunwayIncomplete ? 'text-[#795C24]' : 'text-[#253A32]'}`}>
              {isRunwayIncomplete ? 'Sob revisão' : `${metrics.runwayMonths} meses`}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Projeção de Caixa Determinística (Horizontes 30, 60 e 90 dias) */}
      <div className="p-5 sm:p-6 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E7E1D7] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#253A32]" />
              <h3 className="font-serif text-base sm:text-lg text-[#242823] font-bold">
                Projeção Contínua de Caixa & Liquidez
              </h3>
            </div>
            <p className="text-xs text-[#5F635C] font-sans mt-0.5">
              Horizontes determinísticos calculados a partir de compromissos confirmados, faturas de cartão e ocorrências registradas.
            </p>
          </div>
          <span className="text-xs font-mono text-[#5F635C] bg-[#F6F3ED] px-2.5 py-1 rounded border border-[#E7E1D7] self-start sm:self-auto">
            Saldo Inicial: {formatCurrency(cashFlowProjection?.initialLiquidBalance ?? metrics.totalLiquidBalance)}
          </span>
        </div>

        {/* 3 Horizon Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 30 Dias */}
          <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FAF8F5] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-sans mb-1.5">
                <span className="font-semibold text-[#242823]">Horizonte de 30 Dias</span>
                <span className="text-[10px] font-mono text-[#777A72]">Até {h30?.targetDate || '30 dias'}</span>
              </div>
              <div className="font-serif text-2xl font-bold tabular-nums text-[#242823]">
                {formatCurrency(h30?.projectedClosingBalance ?? metrics.totalLiquidBalance)}
              </div>
              <div className="text-[11px] font-sans text-[#5F635C] mt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Entradas projetadas:</span>
                  <span className="font-mono text-[#245A3C]">+{formatCurrency(h30?.projectedInflows ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Saídas projetadas:</span>
                  <span className="font-mono text-[#963F36]">-{formatCurrency(h30?.projectedOutflows ?? 0)}</span>
                </div>
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-[#E7E1D7] flex items-center justify-between text-[11px] font-sans">
              <span className="text-[#777A72]">Menor saldo intrames:</span>
              <span className={`font-mono font-semibold ${(h30?.lowestProjectedBalance ?? 0) < 0 ? 'text-[#963F36]' : 'text-[#242823]'}`}>
                {formatCurrency(h30?.lowestProjectedBalance ?? metrics.totalLiquidBalance)}
              </span>
            </div>
          </div>

          {/* 60 Dias */}
          <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FAF8F5] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-sans mb-1.5">
                <span className="font-semibold text-[#242823]">Horizonte de 60 Dias</span>
                <span className="text-[10px] font-mono text-[#777A72]">Até {h60?.targetDate || '60 dias'}</span>
              </div>
              <div className="font-serif text-2xl font-bold tabular-nums text-[#242823]">
                {formatCurrency(h60?.projectedClosingBalance ?? metrics.totalLiquidBalance)}
              </div>
              <div className="text-[11px] font-sans text-[#5F635C] mt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Entradas projetadas:</span>
                  <span className="font-mono text-[#245A3C]">+{formatCurrency(h60?.projectedInflows ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Saídas projetadas:</span>
                  <span className="font-mono text-[#963F36]">-{formatCurrency(h60?.projectedOutflows ?? 0)}</span>
                </div>
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-[#E7E1D7] flex items-center justify-between text-[11px] font-sans">
              <span className="text-[#777A72]">Menor saldo intrames:</span>
              <span className={`font-mono font-semibold ${(h60?.lowestProjectedBalance ?? 0) < 0 ? 'text-[#963F36]' : 'text-[#242823]'}`}>
                {formatCurrency(h60?.lowestProjectedBalance ?? metrics.totalLiquidBalance)}
              </span>
            </div>
          </div>

          {/* 90 Dias */}
          <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FAF8F5] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-sans mb-1.5">
                <span className="font-semibold text-[#242823]">Horizonte de 90 Dias</span>
                <span className="text-[10px] font-mono text-[#777A72]">Até {h90?.targetDate || '90 dias'}</span>
              </div>
              <div className="font-serif text-2xl font-bold tabular-nums text-[#242823]">
                {formatCurrency(h90?.projectedClosingBalance ?? metrics.totalLiquidBalance)}
              </div>
              <div className="text-[11px] font-sans text-[#5F635C] mt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Entradas projetadas:</span>
                  <span className="font-mono text-[#245A3C]">+{formatCurrency(h90?.projectedInflows ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Saídas projetadas:</span>
                  <span className="font-mono text-[#963F36]">-{formatCurrency(h90?.projectedOutflows ?? 0)}</span>
                </div>
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-[#E7E1D7] flex items-center justify-between text-[11px] font-sans">
              <span className="text-[#777A72]">Menor saldo intrames:</span>
              <span className={`font-mono font-semibold ${(h90?.lowestProjectedBalance ?? 0) < 0 ? 'text-[#963F36]' : 'text-[#242823]'}`}>
                {formatCurrency(h90?.lowestProjectedBalance ?? metrics.totalLiquidBalance)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Alocação de Renda 50 / 30 / 20 Detalhada */}
      <div className="p-5 sm:p-6 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E7E1D7] pb-3">
          <div>
            <h3 className="font-serif text-base sm:text-lg text-[#242823] font-bold">
              Estrutura de Alocação de Renda (50 / 30 / 20)
            </h3>
            <p className="text-xs text-[#5F635C] font-sans mt-0.5">
              Distribuição proporcional sobre as receitas reais realizadas no período ({formatCurrency(metrics.totalIncome)}).
            </p>
          </div>
          <span className="text-xs font-mono text-[#5F635C] bg-[#F6F3ED] px-2.5 py-1 rounded border border-[#E7E1D7] self-start sm:self-auto">
            Base: Receita Real
          </span>
        </div>

        {/* Proportional Stacked Bar with accurate segments */}
        <div className="w-full h-3.5 rounded-full bg-[#F0EDE6] flex overflow-hidden border border-[#E7E1D7]">
          {metrics.fixedPct > 0 && (
            <div 
              style={{ width: `${Math.min(100, metrics.fixedPct)}%` }} 
              className="bg-[#2A4365] transition-all" 
              title={`Necessidades Essenciais: ${metrics.fixedPct}%`}
            />
          )}
          {metrics.variablePct > 0 && (
            <div 
              style={{ width: `${Math.min(100, metrics.variablePct)}%` }} 
              className="bg-[#B29A70] transition-all" 
              title={`Estilo de Vida & Variáveis: ${metrics.variablePct}%`}
            />
          )}
          {metrics.investmentPct > 0 && (
            <div 
              style={{ width: `${Math.min(100, metrics.investmentPct)}%` }} 
              className="bg-[#245A3C] transition-all" 
              title={`Aportes & Futuro: ${metrics.investmentPct}%`}
            />
          )}
        </div>

        {/* 3 Reference Pillars + Unallocated Superavit */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
          {/* Necessidades */}
          <div className="p-4 rounded-md border border-[#E7E1D7] bg-[#FAF8F5]">
            <div className="flex items-center justify-between text-xs font-sans mb-1">
              <span className="font-semibold text-[#2A4365]">Necessidades Essenciais</span>
              <span className="font-mono text-[11px] text-[#777A72]">Meta: 50%</span>
            </div>
            <div className="text-xl font-serif font-bold text-[#242823] tabular-nums">
              {metrics.fixedPct}%
            </div>
            <div className="text-xs text-[#5F635C] font-sans mt-1">
              {formatCurrency(metrics.fixedExpenses)} realizados
            </div>
            <div className="text-[11px] font-mono mt-2 pt-2 border-t border-[#E7E1D7] text-[#777A72]">
              Desvio: <span className={fixedDeviation > 0 ? 'text-[#963F36] font-bold' : 'text-[#245A3C] font-medium'}>
                {fixedDeviation > 0 ? `+${fixedDeviation}%` : `${fixedDeviation}%`}
              </span>
            </div>
          </div>

          {/* Variáveis */}
          <div className="p-4 rounded-md border border-[#E7E1D7] bg-[#FAF8F5]">
            <div className="flex items-center justify-between text-xs font-sans mb-1">
              <span className="font-semibold text-[#B29A70]">Estilo de Vida & Variáveis</span>
              <span className="font-mono text-[11px] text-[#777A72]">Meta: 30%</span>
            </div>
            <div className="text-xl font-serif font-bold text-[#242823] tabular-nums">
              {metrics.variablePct}%
            </div>
            <div className="text-xs text-[#5F635C] font-sans mt-1">
              {formatCurrency(metrics.variableExpenses)} realizados
            </div>
            <div className="text-[11px] font-mono mt-2 pt-2 border-t border-[#E7E1D7] text-[#777A72]">
              Desvio: <span className={variableDeviation > 0 ? 'text-[#963F36] font-bold' : 'text-[#245A3C] font-medium'}>
                {variableDeviation > 0 ? `+${variableDeviation}%` : `${variableDeviation}%`}
              </span>
            </div>
          </div>

          {/* Aportes */}
          <div className="p-4 rounded-md border border-[#E7E1D7] bg-[#FAF8F5]">
            <div className="flex items-center justify-between text-xs font-sans mb-1">
              <span className="font-semibold text-[#245A3C]">Aportes & Futuro</span>
              <span className="font-mono text-[11px] text-[#777A72]">Meta: 20%</span>
            </div>
            <div className="text-xl font-serif font-bold text-[#242823] tabular-nums">
              {metrics.investmentPct}%
            </div>
            <div className="text-xs text-[#5F635C] font-sans mt-1">
              {formatCurrency(metrics.investmentAmount)} aportados
            </div>
            <div className="text-[11px] font-mono mt-2 pt-2 border-t border-[#E7E1D7] text-[#777A72]">
              Desvio: <span className={investmentDeviation < 0 ? 'text-[#795C24] font-medium' : 'text-[#245A3C] font-bold'}>
                {investmentDeviation > 0 ? `+${investmentDeviation}%` : `${investmentDeviation}%`}
              </span>
            </div>
          </div>

          {/* Superávit Não Alocado */}
          <div className="p-4 rounded-md border border-[#E7E1D7] bg-[#FAF8F5]">
            <div className="flex items-center justify-between text-xs font-sans mb-1">
              <span className="font-semibold text-[#5F635C]">Superávit Livre</span>
              <span className="font-mono text-[11px] text-[#777A72]">Saldo</span>
            </div>
            <div className="text-xl font-serif font-bold text-[#253A32] tabular-nums">
              {unallocatedPct}%
            </div>
            <div className="text-xs text-[#5F635C] font-sans mt-1">
              {formatCurrency(metrics.netCashFlow)} remanescentes
            </div>
            <div className="text-[11px] font-mono mt-2 pt-2 border-t border-[#E7E1D7] text-[#5F635C]">
              Disponível para reserva ou metas
            </div>
          </div>
        </div>
      </div>

      {/* 6. Secondary Content: AI Diagnosis & Budget Deviations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: AI Diagnosis (7 cols) */}
        <div className="lg:col-span-7 p-5 sm:p-6 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E7E1D7]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#B29A70]" />
                <h3 className="font-serif text-base sm:text-lg text-[#242823] font-bold">
                  Diagnóstico Estratégico Consultivo
                </h3>
              </div>
              <span className="text-[10px] sm:text-[11px] font-mono text-[#5F635C] bg-[#F6F3ED] px-2 py-0.5 rounded border border-[#E7E1D7]">
                IA Consultiva • {diagnosis?.tokenCount ? `${diagnosis.tokenCount} tokens` : '0 tokens'}
              </span>
            </div>

            <p className="text-xs font-sans text-[#242823] leading-relaxed mb-4">
              {diagnosis?.summary || 'Clique no botão acima para consolidar a interpretação analítica deste período.'}
            </p>

            {diagnosis?.priorityActions && diagnosis.priorityActions.length > 0 && (
              <div className="space-y-2.5">
                <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-[#777A72]">
                  Sugestões de Ajuste Recomendadas
                </div>
                <div className="space-y-2">
                  {diagnosis.priorityActions.map((action: any, i: number) => (
                    <div 
                      key={i} 
                      className="p-3 rounded-md border border-[#E7E1D7] bg-[#FAF8F5] flex items-start gap-3"
                    >
                      <div className="w-5 h-5 rounded bg-[#253A32] text-white flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-[#242823] font-sans">{action.title}</div>
                        <div className="text-[11px] text-[#5F635C] font-sans mt-0.5">{action.impact}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 mt-5 border-t border-[#E7E1D7] flex flex-wrap items-center justify-between gap-2 text-xs font-sans text-[#5F635C]">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#245A3C]" />
              <span>Sem transmissão de credenciais bancárias</span>
            </div>
            {onSelectTab && (
              <button
                onClick={() => onSelectTab('copilot')}
                className="font-medium text-[#253A32] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Abrir Copiloto</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Right: Budget Deviations (5 cols) */}
        <div className="lg:col-span-5 p-5 sm:p-6 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E7E1D7]">
              <h3 className="font-serif text-base sm:text-lg text-[#242823] font-bold">
                Desvios Orçamentários
              </h3>
              <span className="text-[11px] font-sans text-[#777A72]">
                Limite vs Real
              </span>
            </div>

            {metrics.budgetDeviations && metrics.budgetDeviations.length > 0 ? (
              <div className="divide-y divide-[#E7E1D7]">
                {metrics.budgetDeviations.slice(0, 5).map((dev, idx) => {
                  return (
                    <div key={idx} className="py-2.5 flex items-center justify-between text-xs font-sans">
                      <div>
                        <div className="font-medium text-[#242823]">{dev.categoryName}</div>
                        <div className="text-[11px] text-[#777A72] font-mono">
                          Teto: {formatCurrency(dev.budgetLimit)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-mono font-bold text-[#242823] tabular-nums">
                          {formatCurrency(dev.actualSpent)}
                        </div>
                        <div className={`text-[11px] font-mono font-semibold ${dev.isOverBudget ? 'text-[#963F36]' : 'text-[#245A3C]'}`}>
                          {dev.diffPct > 0 ? `+${dev.diffPct}%` : `${dev.diffPct}%`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[#777A72] font-sans">
                Nenhum desvio registrado para as categorias orçadas.
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#E7E1D7] text-[11px] text-[#777A72] font-sans flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-[#B29A70]" />
            <span>Valores calculados em tempo real sobre os lançamentos reconciliados.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
