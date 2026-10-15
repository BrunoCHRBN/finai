'use client';

import React, { useState, useMemo } from 'react';
import { 
  Receipt, 
  Search, 
  Filter, 
  ArrowUpRight, 
  ArrowDownRight, 
  Plus,
  Landmark,
  Tag
} from 'lucide-react';

interface TransactionsViewProps {
  transactions: any[];
  accounts: any[];
  categories: any[];
  onOpenNewTxModal: () => void;
}

export function TransactionsView({
  transactions,
  accounts,
  categories,
  onOpenNewTxModal,
}: TransactionsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Search text
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesDesc = tx.description.toLowerCase().includes(term);
        const matchesCat = tx.category?.name.toLowerCase().includes(term);
        if (!matchesDesc && !matchesCat) return false;
      }
      // Account filter
      if (selectedAccount !== 'ALL' && tx.accountId !== selectedAccount) {
        return false;
      }
      // Category filter
      if (selectedCategory !== 'ALL' && tx.categoryId !== selectedCategory) {
        return false;
      }
      // Type filter
      if (selectedType === 'INCOME' && tx.amount < 0) return false;
      if (selectedType === 'EXPENSE' && tx.amount >= 0) return false;

      return true;
    });
  }, [transactions, searchTerm, selectedAccount, selectedCategory, selectedType]);

  return (
    <div className="space-y-4">
      {/* Search & Desktop Filter Bar */}
      <div className="p-4 rounded-2xl border border-[#1e2634] bg-[#0f1319] flex flex-wrap items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar por descrição ou estabelecimento (ex: iFood, Uber)..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#12161f] border border-[#1e2634] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Account Filter */}
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#12161f] border border-[#1e2634] text-xs text-slate-300 focus:outline-none focus:border-slate-700 font-mono"
          >
            <option value="ALL">Todas as Contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.institutionName} • {a.name}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#12161f] border border-[#1e2634] text-xs text-slate-300 focus:outline-none focus:border-slate-700"
          >
            <option value="ALL">Todas as Categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Type Filter */}
          <div className="flex rounded-xl bg-[#12161f] border border-[#1e2634] p-0.5 text-xs">
            <button
              onClick={() => setSelectedType('ALL')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                selectedType === 'ALL' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setSelectedType('INCOME')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                selectedType === 'INCOME' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              Entradas
            </button>
            <button
              onClick={() => setSelectedType('EXPENSE')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                selectedType === 'EXPENSE' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              Saídas
            </button>
          </div>

          {/* Add Tx Button */}
          <button
            onClick={onOpenNewTxModal}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/10"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            <span>Novo Registro</span>
          </button>
        </div>
      </div>

      {/* Transactions Data Table */}
      <div className="rounded-2xl border border-[#1e2634] bg-[#0f1319] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e2634] flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-slate-400">
          <div className="flex items-center gap-6">
            <span className="w-24">DATA</span>
            <span className="w-72">DESCRIÇÃO</span>
            <span className="w-40">CONTA</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="w-40">CATEGORIA</span>
            <span className="w-28 text-right">VALOR (BRL)</span>
          </div>
        </div>

        <div className="divide-y divide-[#1e2634]">
          {filteredTransactions.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Nenhuma transação encontrada com os filtros selecionados.
            </div>
          ) : (
            filteredTransactions.map((tx) => {
              const isIncome = tx.amount > 0;
              return (
                <div
                  key={tx.id}
                  className="px-5 py-3 flex items-center justify-between hover:bg-[#12161f]/60 transition-all text-xs"
                >
                  {/* Left: Date, Description, Account */}
                  <div className="flex items-center gap-6">
                    <span className="w-24 font-mono text-slate-400 tabular-nums">
                      {tx.date}
                    </span>
                    <div className="w-72 flex items-center gap-2">
                      <div className={`p-1 rounded-full ${isIncome ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                        {isIncome ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      </div>
                      <span className="font-medium text-white truncate" title={tx.description}>
                        {tx.description}
                      </span>
                    </div>
                    <div className="w-40 flex items-center gap-1.5 text-slate-400 truncate">
                      <Landmark className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{tx.account?.name || 'Conta Padrão'}</span>
                    </div>
                  </div>

                  {/* Right: Category, Amount */}
                  <div className="flex items-center gap-6">
                    <div className="w-40">
                      {tx.category ? (
                        <span 
                          className="px-2 py-0.5 rounded text-[11px] font-medium border"
                          style={{
                            borderColor: `${tx.category.color}40`,
                            backgroundColor: `${tx.category.color}15`,
                            color: tx.category.color,
                          }}
                        >
                          {tx.category.name}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">Sem Categoria</span>
                      )}
                    </div>

                    <div className="w-28 text-right font-mono font-bold text-xs tabular-nums">
                      <span className={isIncome ? 'text-emerald-400' : 'text-slate-200'}>
                        {isIncome ? `+${formatCurrency(tx.amount)}` : formatCurrency(tx.amount)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
