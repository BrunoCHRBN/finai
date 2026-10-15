'use client';

import React, { useState } from 'react';
import { X, Plus, Calendar, DollarSign, Tag, Landmark } from 'lucide-react';

interface NewTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: any[];
  categories: any[];
  onAddTransaction: (data: {
    description: string;
    amount: number;
    accountId: string;
    categoryId?: string;
    date: string;
    type: 'DEBIT' | 'CREDIT';
  }) => Promise<void>;
}

export function NewTransactionModal({
  isOpen,
  onClose,
  accounts,
  categories,
  onAddTransaction,
}: NewTransactionModalProps) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [isExpense, setIsExpense] = useState(true);
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount.replace(',', '.'));
    if (!description || isNaN(num) || num <= 0 || !accountId) return;

    setIsLoading(true);
    try {
      const finalAmount = isExpense ? -Math.abs(num) : Math.abs(num);
      await onAddTransaction({
        description,
        amount: finalAmount,
        accountId,
        categoryId: categoryId || undefined,
        date,
        type: isExpense ? 'DEBIT' : 'CREDIT',
      });
      onClose();
      setDescription('');
      setAmount('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-md rounded-2xl border border-[#1e2634] bg-[#0c0f14] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[#1e2634] flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" />
            Registrar Nova Transação
          </h3>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Type Toggle: Despesa vs Receita */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#12161f] border border-[#1e2634]">
            <button
              type="button"
              onClick={() => setIsExpense(true)}
              className={`py-2 rounded-lg font-bold transition-all ${
                isExpense ? 'bg-rose-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Despesa (Saída)
            </button>
            <button
              type="button"
              onClick={() => setIsExpense(false)}
              className={`py-2 rounded-lg font-bold transition-all ${
                !isExpense ? 'bg-emerald-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Receita (Entrada)
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-slate-400 font-mono mb-1 text-[11px]">VALOR (R$)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono font-bold">R$</span>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#12161f] border border-[#1e2634] text-white font-mono text-base font-bold focus:outline-none focus:border-emerald-500"
                autoFocus
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-slate-400 font-mono mb-1 text-[11px]">DESCRIÇÃO</label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Almoço Restaurante, Assinatura Netflix, Freelance..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#12161f] border border-[#1e2634] text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Account & Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-mono mb-1 text-[11px]">CONTA / CARTÃO</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#12161f] border border-[#1e2634] text-white focus:outline-none focus:border-emerald-500 font-mono"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-mono mb-1 text-[11px]">CATEGORIA</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#12161f] border border-[#1e2634] text-white focus:outline-none focus:border-emerald-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-slate-400 font-mono mb-1 text-[11px]">DATA</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-[#12161f] border border-[#1e2634] text-white font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {isLoading ? 'Salvando...' : 'Confirmar Lançamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
