'use client';

import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';

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
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#242823]/40 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md rounded-xl border border-[#E7E1D7] bg-[#FFFFFF] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#E7E1D7] flex items-center justify-between bg-[#FAF8F5]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#253A32] text-white flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#242823]">
                Lançamento Manual de Transação
              </h3>
              <p className="text-[10px] text-[#777A72] font-mono">
                Extrato auxiliar com conciliação imediata
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-md text-[#777A72] hover:text-[#242823] hover:bg-[#E7E1D7]/50 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Type Toggle: Despesa vs Receita */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-[#F0EDE6] border border-[#E7E1D7]">
            <button
              type="button"
              onClick={() => setIsExpense(true)}
              className={`py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                isExpense 
                  ? 'bg-[#963F36] text-white shadow-sm' 
                  : 'text-[#5F635C] hover:text-[#242823]'
              }`}
            >
              Despesa Operacional (Débito)
            </button>
            <button
              type="button"
              onClick={() => setIsExpense(false)}
              className={`py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                !isExpense 
                  ? 'bg-[#253A32] text-white shadow-sm' 
                  : 'text-[#5F635C] hover:text-[#242823]'
              }`}
            >
              Receita / Entrada (Crédito)
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-[#777A72] font-mono mb-1 text-[11px] uppercase tracking-wider font-semibold">
              Valor Nominal (R$)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#777A72] font-mono font-semibold">
                R$
              </span>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#FFFFFF] border border-[#E7E1D7] text-[#242823] font-mono text-base font-bold focus:outline-none focus:border-[#253A32] focus:ring-1 focus:ring-[#253A32]/20"
                autoFocus
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[#777A72] font-mono mb-1 text-[11px] uppercase tracking-wider font-semibold">
              Descrição do Lançamento
            </label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Aluguel Comercial, Honorários, Supermercado..."
              className="w-full px-3.5 py-2 rounded-lg bg-[#FFFFFF] border border-[#E7E1D7] text-[#242823] focus:outline-none focus:border-[#253A32] focus:ring-1 focus:ring-[#253A32]/20 text-xs"
            />
          </div>

          {/* Account & Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#777A72] font-mono mb-1 text-[11px] uppercase tracking-wider font-semibold">
                Conta de Destino
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#FFFFFF] border border-[#E7E1D7] text-[#242823] focus:outline-none focus:border-[#253A32] font-mono text-xs cursor-pointer"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[#777A72] font-mono mb-1 text-[11px] uppercase tracking-wider font-semibold">
                Categoria Contábil
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#FFFFFF] border border-[#E7E1D7] text-[#242823] focus:outline-none focus:border-[#253A32] text-xs cursor-pointer"
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
            <label className="block text-[#777A72] font-mono mb-1 text-[11px] uppercase tracking-wider font-semibold">
              Data de Competência
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg bg-[#FFFFFF] border border-[#E7E1D7] text-[#242823] font-mono focus:outline-none focus:border-[#253A32] text-xs"
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-lg bg-[#253A32] hover:bg-[#1C2C26] text-white font-semibold text-xs transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? 'Registrando...' : 'Confirmar Lançamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
