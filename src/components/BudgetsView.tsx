'use client';

import React, { useState } from 'react';
import { 
  PieChart, 
  AlertTriangle, 
  CheckCircle2, 
  Sliders, 
  Save, 
  ArrowRight,
  TrendingDown,
  Info
} from 'lucide-react';
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

  // Map category spent
  const deviationMap = new Map(metrics.budgetDeviations.map((d) => [d.categoryName, d]));

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-5 rounded-2xl border border-[#1e2634] bg-[#0f1319] flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <PieChart className="w-5 h-5 text-emerald-400" />
            Controle de Orçamentos por Categoria (Envelopes)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Tetos por envelope. As barras mostram o consumo acumulado no mês contra o limite definido.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="p-2.5 rounded-lg bg-[#12161f] border border-[#1e2634]">
            <span className="text-slate-400">Teto Total: </span>
            <span className="text-white font-bold">
              {formatCurrency(categories.reduce((acc, c) => acc + (c.budgetLimit || 0), 0))}
            </span>
          </div>
        </div>
      </div>

      {/* Critical Overbudget Alerts (if any) */}
      {metrics.budgetDeviations.filter((d) => d.isOverBudget).length > 0 && (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs">
          <div className="flex items-center gap-2 font-bold text-rose-400 mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span>Categorias com teto estourado em outubro:</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {metrics.budgetDeviations
              .filter((d) => d.isOverBudget)
              .map((d, idx) => (
                <div key={idx} className="p-2.5 rounded-lg bg-[#12161f] border border-rose-500/20 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-white">{d.categoryName}</span>
                    <div className="text-[11px] text-slate-400">
                      Gasto: <span className="text-rose-400 font-mono font-bold">{formatCurrency(d.actualSpent)}</span> de {formatCurrency(d.budgetLimit)}
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-rose-400 px-2 py-0.5 rounded bg-rose-500/20">
                    +{d.diffPct}% acima
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Categories Budget Table */}
      <div className="rounded-2xl border border-[#1e2634] bg-[#0f1319] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#1e2634] flex items-center justify-between text-xs font-semibold text-slate-400">
          <span>CATEGORIA / GRUPO</span>
          <div className="flex items-center gap-12">
            <span>CONSUMO NO MÊS</span>
            <span className="w-32 text-right">TETO DEFINIDO</span>
            <span className="w-20 text-right">AÇÕES</span>
          </div>
        </div>

        <div className="divide-y divide-[#1e2634]">
          {categories.filter((c) => c.group !== 'INCOME').map((cat) => {
            const dev = deviationMap.get(cat.name);
            const spent = dev ? dev.actualSpent : 0;
            const limit = cat.budgetLimit || 0;
            const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;

            const isEditing = editingId === cat.id;

            let barColor = 'bg-emerald-500';
            let badgeColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
            if (pct >= 100) {
              barColor = 'bg-rose-500';
              badgeColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
            } else if (pct >= 75) {
              barColor = 'bg-amber-500';
              badgeColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
            }

            return (
              <div key={cat.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-[#12161f]/50 transition-all text-xs">
                {/* Category details */}
                <div className="flex items-center gap-3">
                  <div 
                    className="w-3 h-3 rounded-full shrink-0" 
                    style={{ backgroundColor: cat.color || '#3b82f6' }} 
                  />
                  <div>
                    <div className="font-semibold text-white">{cat.name}</div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {cat.group === 'FIXED' ? 'Custo Fixo Essencial' : cat.group === 'INVESTMENT' ? 'Aporte Patrimonial' : 'Estilo de Vida'}
                    </div>
                  </div>
                </div>

                {/* Progress & Values */}
                <div className="flex items-center gap-12">
                  <div className="w-48">
                    <div className="flex items-center justify-between text-[11px] mb-1 font-mono">
                      <span className="text-white font-medium">{formatCurrency(spent)}</span>
                      <span className={`px-1.5 py-0.2 rounded border font-semibold ${badgeColor}`}>
                        {pct}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>

                  {/* Limit column (with inline edit) */}
                  <div className="w-32 text-right font-mono">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-slate-400">R$</span>
                        <input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-20 px-1.5 py-0.5 rounded bg-slate-900 border border-emerald-500 text-white font-mono text-xs text-right focus:outline-none"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <span className="text-slate-300 font-semibold">{formatCurrency(limit)}</span>
                    )}
                  </div>

                  {/* Action */}
                  <div className="w-20 text-right">
                    {isEditing ? (
                      <button
                        onClick={() => handleSave(cat.id)}
                        disabled={isSaving}
                        className="px-2 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] transition-all"
                      >
                        {isSaving ? '...' : 'Salvar'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartEdit(cat.id, limit)}
                        className="px-2 py-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 text-[11px] font-medium transition-all"
                      >
                        Ajustar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
