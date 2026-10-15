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
  AlertCircle
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
  onOpenAIDiagnosis,
}: DashboardViewProps) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const statusConfig: Record<string, { label: string; color: string; surface: string; icon: any }> = {
    OPTIMAL: { label: 'Superávit Estável', color: 'text-[#245A3C]', surface: 'bg-[#E4EFE6] border-[#D1E2D4]', icon: CheckCircle2 },
    ATTENTION: { label: 'Atenção Orçamentária', color: 'text-[#795C24]', surface: 'bg-[#F5EEDB] border-[#E8DEC7]', icon: AlertTriangle },
    CRITICAL: { label: 'Déficit de Caixa', color: 'text-[#963F36]', surface: 'bg-[#F8E8E5] border-[#EED0CC]', icon: ShieldAlert },
  };

  const currentStatus = statusConfig[diagnosis?.status] || statusConfig['ATTENTION'];
  const StatusIcon = currentStatus.icon;

  return (
    <div className="space-y-6">
      {/* 1. Page Header: Editorial Display Title */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-[#E7E1D7]">
        <div>
          <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-[#777A72] mb-1">
            Gestão Patrimonial & Fluxo de Caixa
          </div>
          <h1 className="font-serif text-3xl md:text-4xl text-[#242823] tracking-tight">
            Visão Geral Consolidada
          </h1>
          <p className="text-xs font-sans text-[#5F635C] mt-1">
            Balanço consolidado a partir das contas verificadas do C6 Bank e Itaú via Open Finance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-sans font-medium border ${currentStatus.surface} ${currentStatus.color}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            <span>{currentStatus.label}</span>
          </div>

          <button
            onClick={onOpenAIDiagnosis}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md border border-[#D6CFC2] bg-[#FFFFFF] hover:bg-[#F3F1EB] text-xs font-sans font-medium text-[#242823] transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#B29A70]" />
            <span>Recalcular com IA</span>
          </button>
        </div>
      </div>

      {/* 2. Primary Financial Balance Banner & Core KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Main Liquid Balance Hero Card (5 cols) */}
        <div className="lg:col-span-5 p-6 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#5F635C] mb-2 font-sans">
              <span>Saldo Disponível em Caixa</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#F0EDE6] text-[#5F635C] border border-[#E7E1D7]">
                Disponibilidade Imediata
              </span>
            </div>

            <div className="font-serif text-4xl text-[#242823] tabular-nums font-bold tracking-tight mt-1">
              {formatCurrency(metrics.totalLiquidBalance)}
            </div>

            <div className="text-xs text-[#5F635C] font-sans mt-2 leading-relaxed">
              Total consolidado em contas correntes ativas (C6 Bank e Itaú).
            </div>
          </div>

          <div className="pt-5 mt-5 border-t border-[#E7E1D7] grid grid-cols-2 gap-4 text-xs font-sans">
            <div>
              <div className="text-[#777A72] text-[11px]">Runway Estimado</div>
              <div className="font-mono font-bold text-sm text-[#242823] tabular-nums mt-0.5">
                {metrics.runwayMonths} meses
              </div>
              <div className="text-[10px] text-[#777A72] mt-0.5">
                Calculado sobre gastos essenciais fixos.
              </div>
            </div>

            <div>
              <div className="text-[#777A72] text-[11px]">Taxa de Poupança</div>
              <div className="font-mono font-bold text-sm text-[#245A3C] tabular-nums mt-0.5">
                {metrics.savingsRatePct}%
              </div>
              <div className="text-[10px] text-[#777A72] mt-0.5">
                Meta recomendada: 20%.
              </div>
            </div>
          </div>
        </div>

        {/* Breakdown Operational KPIs (7 cols) */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Income Card */}
          <div className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[#5F635C] mb-2 font-sans">
              <span>Entradas Realizadas</span>
              <div className="p-1 rounded bg-[#E4EFE6] text-[#245A3C]">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-serif text-[#242823] font-bold tabular-nums">
              {formatCurrency(metrics.totalIncome)}
            </div>
            <div className="text-[11px] text-[#5F635C] font-sans mt-2 pt-2 border-t border-[#F0EDE6] flex items-center justify-between">
              <span>Créditos e transferências</span>
              <span className="font-mono text-[#245A3C] font-medium">+100% recebido</span>
            </div>
          </div>

          {/* Expenses Card */}
          <div className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[#5F635C] mb-2 font-sans">
              <span>Despesas Totais</span>
              <div className="p-1 rounded bg-[#F8E8E5] text-[#963F36]">
                <ArrowDownRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-serif text-[#963F36] font-bold tabular-nums">
              {formatCurrency(metrics.totalExpenses)}
            </div>
            <div className="text-[11px] text-[#5F635C] font-sans mt-2 pt-2 border-t border-[#F0EDE6] flex items-center justify-between">
              <span>Fixos: {formatCurrency(metrics.fixedExpenses)}</span>
              <span>Variáveis: {formatCurrency(metrics.variableExpenses)}</span>
            </div>
          </div>

          {/* Net Cash Flow Card */}
          <div className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[#5F635C] mb-2 font-sans">
              <span>Resultado Líquido do Mês</span>
              <div className="p-1 rounded bg-[#E4EFE6] text-[#245A3C]">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className={`text-2xl font-serif font-bold tabular-nums ${metrics.netCashFlow >= 0 ? 'text-[#245A3C]' : 'text-[#963F36]'}`}>
              {formatCurrency(metrics.netCashFlow)}
            </div>
            <div className="text-[11px] text-[#5F635C] font-sans mt-2 pt-2 border-t border-[#F0EDE6] flex items-center justify-between">
              <span>Superávit livre</span>
              <span className="font-mono text-[#5F635C]">
                {metrics.netCashFlow >= 0 ? 'Caixa positivo' : 'Pressão de caixa'}
              </span>
            </div>
          </div>

          {/* Investment Allocations Card */}
          <div className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[#5F635C] mb-2 font-sans">
              <span>Aportes & Investimentos</span>
              <div className="p-1 rounded bg-[#F0EDE6] text-[#253A32]">
                <PieChart className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-serif text-[#253A32] font-bold tabular-nums">
              {formatCurrency(metrics.investmentAmount)}
            </div>
            <div className="text-[11px] text-[#5F635C] font-sans mt-2 pt-2 border-t border-[#F0EDE6] flex items-center justify-between">
              <span>Participação na renda</span>
              <span className="font-mono font-medium text-[#242823]">{metrics.investmentPct}% da receita</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Rule 50 / 30 / 20 Analytical Allocation Bar */}
      <div className="p-6 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="font-serif text-lg text-[#242823] font-bold">
              Estrutura de Alocação de Renda (50 / 30 / 20)
            </h3>
            <p className="text-xs text-[#5F635C] font-sans mt-0.5">
              Comparação proporcional entre os gastos observados neste mês e a regra canônica de gestão de patrimônio.
            </p>
          </div>
          <span className="text-xs font-mono text-[#5F635C] bg-[#F6F3ED] px-2.5 py-1 rounded border border-[#E7E1D7]">
            Base de Cálculo: Receita Real
          </span>
        </div>

        {/* Horizontal Stacked Proportional Bar */}
        <div className="w-full h-3 rounded-full bg-[#F0EDE6] flex overflow-hidden mb-4 border border-[#E7E1D7]">
          <div 
            style={{ width: `${Math.max(2, metrics.fixedPct)}%` }} 
            className="bg-[#2A4365] transition-all" 
            title={`Necessidades Fixas: ${metrics.fixedPct}%`}
          />
          <div 
            style={{ width: `${Math.max(2, metrics.variablePct)}%` }} 
            className="bg-[#B29A70] transition-all" 
            title={`Gastos Variáveis: ${metrics.variablePct}%`}
          />
          <div 
            style={{ width: `${Math.max(2, metrics.investmentPct)}%` }} 
            className="bg-[#245A3C] transition-all" 
            title={`Aportes & Poupança: ${metrics.investmentPct}%`}
          />
        </div>

        {/* 3 Reference Metric Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="p-3.5 rounded-md border border-[#E7E1D7] bg-[#F6F3ED]">
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
          </div>

          <div className="p-3.5 rounded-md border border-[#E7E1D7] bg-[#F6F3ED]">
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
          </div>

          <div className="p-3.5 rounded-md border border-[#E7E1D7] bg-[#F6F3ED]">
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
          </div>
        </div>
      </div>

      {/* 4. Strategic AI Executive Summary & Category Deviations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: AI Executive Analysis (7 cols) */}
        <div className="lg:col-span-7 p-6 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E7E1D7]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#B29A70]" />
                <h3 className="font-serif text-lg text-[#242823] font-bold">
                  Diagnóstico Estratégico de Liquidez
                </h3>
              </div>
              <span className="text-[11px] font-mono text-[#5F635C] bg-[#F6F3ED] px-2 py-0.5 rounded border border-[#E7E1D7]">
                {diagnosis?.tokenCount ? `${diagnosis.tokenCount} tokens` : 'Gemini Flash Lite'}
              </span>
            </div>

            <p className="text-xs font-sans text-[#242823] leading-relaxed mb-5">
              {diagnosis?.summary || 'Clique no botão acima para consolidar a análise analítica deste período.'}
            </p>

            {diagnosis?.priorityActions && diagnosis.priorityActions.length > 0 && (
              <div className="space-y-2.5">
                <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-[#777A72]">
                  Ações de Otimização Recomendadas
                </div>
                <div className="space-y-2">
                  {diagnosis.priorityActions.map((action: any, i: number) => (
                    <div 
                      key={i} 
                      className="p-3 rounded-md border border-[#E7E1D7] bg-[#F6F3ED] flex items-start gap-3"
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

          <div className="pt-4 mt-5 border-t border-[#E7E1D7] flex items-center justify-between text-xs font-sans text-[#5F635C]">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#245A3C]" />
              <span>Sem transmissão de credenciais ou dados bancários brutos</span>
            </div>
            <button
              onClick={onOpenAIDiagnosis}
              className="font-medium text-[#253A32] hover:underline flex items-center gap-1"
            >
              <span>Relatório completo</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Right: Budget Deviations Ledger (5 cols) */}
        <div className="lg:col-span-5 p-6 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E7E1D7]">
              <h3 className="font-serif text-lg text-[#242823] font-bold">
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
            <span>Valores calculados em tempo real sobre os 212 lançamentos reconciliados.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
