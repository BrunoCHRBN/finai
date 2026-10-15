'use client';

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { FinancialMetrics } from '@/lib/ai/math-engine';

interface BudgetsViewProps {
  metrics: FinancialMetrics;
  categories: any[];
  onUpdateCategoryBudget: (categoryId: string, newLimit: number) => Promise<void>;
}

export function BudgetsView({ metrics, categories, onUpdateCategoryBudget }: BudgetsViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const handleStartEdit = (catId: string, currentLimit: number) => {
    setEditingId(catId);
    setEditValue(currentLimit.toString());
  };

  const handleSave = async (catId: string) => {
    const num = parseFloat(editValue);
    if (isNaN(num) || num < 0) return;
    setIsSaving(true);
    try {
      await onUpdateCategoryBudget(catId, num);
      setEditingId(null);
    } finally {
      setIsSaving(false);
    }
  };

  const deviationMap = new Map(metrics.budgetDeviations.map((d) => [d.categoryName, d]));

  const expenseCategories = categories.filter((c) => c.group !== 'INCOME');
  const totalBudgeted = expenseCategories.reduce((acc, c) => acc + (c.budgetLimit || 0), 0);
  const totalRealized = metrics.totalExpenses;
  const remainingBudget = totalBudgeted - totalRealized;
  const overBudgetCategories = metrics.budgetDeviations.filter((d) => d.isOverBudget);

  return (
    <div className="space-y-6">
      {/* 1. Header: Editorial Display Title */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-[#E7E1D7]">
        <div>
          <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-[#777A72] mb-1">
            Planejamento & Controle Orçamentário
          </div>
          <h1 className="font-serif text-3xl md:text-4xl text-[#242823] tracking-tight">
            Tetos de Gastos & Envelopes
          </h1>
          <p className="text-xs font-sans text-[#5F635C] mt-1">
            Comparação sistemática entre limites estabelecidos e o consumo apurado no extrato reconciliado.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-md border border-[#E7E1D7] bg-[#FFFFFF] text-xs font-sans">
            <span className="text-[#777A72]">Teto Global: </span>
            <strong className="text-[#242823] font-mono tabular-nums font-bold">
              {formatCurrency(totalBudgeted)}
            </strong>
          </div>
        </div>
      </div>

      {/* 2. Top Variance Summary Pillars */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
          <div className="text-[11px] font-sans font-semibold text-[#777A72] uppercase">
            Total Orçado no Mês
          </div>
          <div className="text-2xl font-serif font-bold text-[#242823] tabular-nums mt-1">
            {formatCurrency(totalBudgeted)}
          </div>
          <div className="text-[11px] text-[#5F635C] font-sans mt-1">
            Soma dos tetos em {expenseCategories.length} categorias
          </div>
        </div>

        <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
          <div className="text-[11px] font-sans font-semibold text-[#777A72] uppercase">
            Gasto Total Realizado
          </div>
          <div className="text-2xl font-serif font-bold text-[#963F36] tabular-nums mt-1">
            {formatCurrency(totalRealized)}
          </div>
          <div className="text-[11px] text-[#5F635C] font-sans mt-1">
            Consumo verificado em conta e cartões
          </div>
        </div>

        <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
          <div className="text-[11px] font-sans font-semibold text-[#777A72] uppercase">
            Margem Remanescente
          </div>
          <div className={`text-2xl font-serif font-bold tabular-nums mt-1 ${remainingBudget >= 0 ? 'text-[#245A3C]' : 'text-[#963F36]'}`}>
            {formatCurrency(remainingBudget)}
          </div>
          <div className="text-[11px] text-[#5F635C] font-sans mt-1">
            {remainingBudget >= 0 ? 'Dentro do teto global' : 'Excedente acumulado'}
          </div>
        </div>
      </div>

      {/* 3. Discretionary Overbudget Alert Notice (if any) */}
      {overBudgetCategories.length > 0 && (
        <div className="p-4 rounded-lg border border-[#EED0CC] bg-[#F8E8E5] text-xs font-sans">
          <div className="flex items-center gap-2 font-bold text-[#963F36] mb-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Categorias com teto excedido neste período ({overBudgetCategories.length}):</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-2">
            {overBudgetCategories.map((d, idx) => (
              <div 
                key={idx} 
                className="p-2.5 rounded-md bg-[#FFFFFF] border border-[#EED0CC] flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-[#242823]">{d.categoryName}</span>
                  <div className="text-[11px] text-[#777A72] font-mono">
                    Gasto: {formatCurrency(d.actualSpent)} / Teto: {formatCurrency(d.budgetLimit)}
                  </div>
                </div>
                <span className="text-[11px] font-mono font-bold text-[#963F36] px-1.5 py-0.5 rounded bg-[#F8E8E5]">
                  +{d.diffPct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Structured Budget Variance Table */}
      <div className="rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans border-collapse">
            <thead>
              <tr className="border-b border-[#E7E1D7] bg-[#F6F3ED] text-[#777A72] text-[11px] font-sans font-semibold tracking-wider uppercase">
                <th className="py-2.5 px-4">Categoria & Natureza</th>
                <th className="py-2.5 px-4 w-40 text-right">Realizado</th>
                <th className="py-2.5 px-4 w-48">Consumo do Teto</th>
                <th className="py-2.5 px-4 w-40 text-right">Teto Planejado</th>
                <th className="py-2.5 px-4 w-28 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E1D7]">
              {expenseCategories.map((cat) => {
                const dev = deviationMap.get(cat.name);
                const spent = dev ? dev.actualSpent : 0;
                const limit = cat.budgetLimit || 0;
                const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
                const isEditing = editingId === cat.id;

                const isOver = pct > 100;
                const isNear = pct >= 75 && pct <= 100;

                return (
                  <tr key={cat.id} className="hover:bg-[#F3F1EB] transition-colors">
                    {/* Category details */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div 
                          className="w-2.5 h-2.5 rounded-full shrink-0" 
                          style={{ backgroundColor: cat.color || '#253A32' }} 
                        />
                        <div>
                          <div className="font-semibold text-[#242823]">{cat.name}</div>
                          <div className="text-[11px] text-[#777A72]">
                            {cat.group === 'FIXED' 
                              ? 'Custo Fixo Essencial' 
                              : cat.group === 'INVESTMENT' 
                              ? 'Aporte Patrimonial' 
                              : 'Estilo de Vida'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Realized Spent */}
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#242823] tabular-nums">
                      {formatCurrency(spent)}
                    </td>

                    {/* Consumption Bar */}
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className={isOver ? 'text-[#963F36] font-bold' : isNear ? 'text-[#795C24] font-semibold' : 'text-[#5F635C]'}>
                            {pct}% consumido
                          </span>
                        </div>
                        <div className="w-full bg-[#F0EDE6] rounded-full h-1.5 overflow-hidden border border-[#E7E1D7]">
                          <div 
                            className={`h-1.5 rounded-full ${isOver ? 'bg-[#963F36]' : isNear ? 'bg-[#795C24]' : 'bg-[#245A3C]'}`} 
                            style={{ width: `${Math.min(100, pct)}%` }} 
                          />
                        </div>
                      </div>
                    </td>

                    {/* Planned Limit (with inline edit) */}
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-[#777A72]">R$</span>
                          <input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-24 px-1.5 py-0.5 rounded bg-[#FFFFFF] border border-[#253A32] text-[#242823] font-mono text-xs text-right focus:outline-none"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <span className="font-medium text-[#242823]">{formatCurrency(limit)}</span>
                      )}
                    </td>

                    {/* Action Button */}
                    <td className="py-3 px-4 text-right">
                      {isEditing ? (
                        <button
                          onClick={() => handleSave(cat.id)}
                          disabled={isSaving}
                          className="px-2.5 py-1 rounded bg-[#253A32] hover:bg-[#1B2B25] text-white font-medium text-xs transition-colors"
                        >
                          {isSaving ? 'Gravando...' : 'Salvar'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartEdit(cat.id, limit)}
                          className="px-2.5 py-1 rounded border border-[#E7E1D7] text-[#5F635C] hover:text-[#242823] hover:bg-[#F0EDE6] text-xs font-medium transition-colors"
                        >
                          Ajustar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
