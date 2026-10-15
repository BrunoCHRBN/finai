'use client';

import React, { useState, useMemo } from 'react';
import { 
  Search, 
  ArrowUpRight, 
  ArrowDownRight, 
  Plus,
  Landmark,
  X
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
  const [selectedTransaction, setSelectedTransaction] = useState<any | null>(null);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Search text
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesDesc = tx.description?.toLowerCase().includes(term);
        const matchesCat = tx.category?.name?.toLowerCase().includes(term);
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

  // Aggregate stats for current filter
  const stats = useMemo(() => {
    let income = 0;
    let expense = 0;
    filteredTransactions.forEach((t) => {
      if (t.amount > 0) income += t.amount;
      else expense += Math.abs(t.amount);
    });
    return {
      count: filteredTransactions.length,
      income,
      expense,
      balance: income - expense,
    };
  }, [filteredTransactions]);

  return (
    <div className="space-y-5">
      {/* 1. Header: Editorial Title & Action */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-[#E7E1D7]">
        <div>
          <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-[#777A72] mb-1">
            Auditoria & Conciliação de Lançamentos
          </div>
          <h1 className="font-serif text-3xl md:text-4xl text-[#242823] tracking-tight">
            Movimentações Financeiras
          </h1>
          <p className="text-xs font-sans text-[#5F635C] mt-1">
            Registro unificado de extratos bancários, cartões e lançamentos manuais com conciliação automática.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenNewTxModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#253A32] hover:bg-[#1B2B25] text-white text-xs font-sans font-medium transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 text-white" />
            <span>Registrar Movimentação</span>
          </button>
        </div>
      </div>

      {/* 2. Compact Analytical Filter & Search Bar */}
      <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[280px]">
            <Search className="w-4 h-4 text-[#777A72] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por estabelecimento, credor ou descrição..."
              className="w-full pl-9 pr-4 py-1.5 rounded-md bg-[#F6F3ED] border border-[#E7E1D7] text-xs font-sans text-[#242823] placeholder-[#777A72] focus:outline-none focus:border-[#253A32] transition-colors"
            />
          </div>

          {/* Account Filter */}
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="px-3 py-1.5 rounded-md bg-[#FFFFFF] border border-[#E7E1D7] text-xs font-sans text-[#242823] focus:outline-none focus:border-[#253A32]"
          >
            <option value="ALL">Todas as Contas ({accounts.length})</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 rounded-md bg-[#FFFFFF] border border-[#E7E1D7] text-xs font-sans text-[#242823] focus:outline-none focus:border-[#253A32]"
          >
            <option value="ALL">Todas as Categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Type Segmented Control */}
          <div className="flex rounded-md bg-[#F0EDE6] border border-[#E7E1D7] p-0.5 text-xs font-sans">
            <button
              onClick={() => setSelectedType('ALL')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                selectedType === 'ALL'
                  ? 'bg-[#FFFFFF] text-[#242823] shadow-xs'
                  : 'text-[#5F635C] hover:text-[#242823]'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setSelectedType('INCOME')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                selectedType === 'INCOME'
                  ? 'bg-[#FFFFFF] text-[#245A3C] shadow-xs'
                  : 'text-[#5F635C] hover:text-[#242823]'
              }`}
            >
              Entradas
            </button>
            <button
              onClick={() => setSelectedType('EXPENSE')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                selectedType === 'EXPENSE'
                  ? 'bg-[#FFFFFF] text-[#963F36] shadow-xs'
                  : 'text-[#5F635C] hover:text-[#242823]'
              }`}
            >
              Saídas
            </button>
          </div>
        </div>

        {/* Filter Summary Row */}
        <div className="pt-2.5 border-t border-[#F0EDE6] flex flex-wrap items-center justify-between text-xs font-sans text-[#5F635C]">
          <div className="flex items-center gap-4">
            <span>
              Exibindo <strong className="text-[#242823]">{stats.count}</strong> movimentações
            </span>
            <span className="text-[#D6CFC2]">•</span>
            <span>
              Entradas: <strong className="text-[#245A3C] font-mono tabular-nums">+{formatCurrency(stats.income)}</strong>
            </span>
            <span className="text-[#D6CFC2]">•</span>
            <span>
              Saídas: <strong className="text-[#963F36] font-mono tabular-nums">-{formatCurrency(stats.expense)}</strong>
            </span>
          </div>

          <div className="font-mono text-xs text-[#242823]">
            Saldo Filtrado: <strong className={stats.balance >= 0 ? 'text-[#245A3C]' : 'text-[#963F36]'}>{formatCurrency(stats.balance)}</strong>
          </div>
        </div>
      </div>

      {/* 3. Structured Data Ledger */}
      <div className="rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans border-collapse">
            <thead>
              <tr className="border-b border-[#E7E1D7] bg-[#F6F3ED] text-[#777A72] text-[11px] font-sans font-semibold tracking-wider uppercase">
                <th className="py-2.5 px-4 w-28">Data</th>
                <th className="py-2.5 px-4">Estabelecimento / Descrição</th>
                <th className="py-2.5 px-4 w-44">Instituição</th>
                <th className="py-2.5 px-4 w-48">Categoria</th>
                <th className="py-2.5 px-4 w-36 text-right">Valor (BRL)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E1D7]">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-[#777A72] text-xs">
                    Nenhuma movimentação encontrada para os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const isIncome = tx.amount > 0;
                  const isSelected = selectedTransaction?.id === tx.id;
                  return (
                    <tr
                      key={tx.id}
                      onClick={() => setSelectedTransaction(tx)}
                      className={`cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-[#F0EDE6]' 
                          : 'hover:bg-[#F3F1EB]'
                      }`}
                    >
                      {/* Date */}
                      <td className="py-2.5 px-4 font-mono text-[#5F635C] tabular-nums whitespace-nowrap">
                        {formatDate(tx.date)}
                      </td>

                      {/* Description & Icon */}
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5 max-w-md">
                          <div className={`p-1 rounded shrink-0 ${isIncome ? 'bg-[#E4EFE6] text-[#245A3C]' : 'bg-[#F0EDE6] text-[#5F635C]'}`}>
                            {isIncome ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          </div>
                          <span className="font-medium text-[#242823] truncate" title={tx.description}>
                            {tx.description}
                          </span>
                        </div>
                      </td>

                      {/* Account */}
                      <td className="py-2.5 px-4 text-[#5F635C] whitespace-nowrap">
                        <div className="flex items-center gap-1.5 truncate">
                          <Landmark className="w-3.5 h-3.5 text-[#777A72] shrink-0" />
                          <span className="truncate">{tx.account?.name || 'Conta Reconciliada'}</span>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {tx.category ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-sans font-medium bg-[#F0EDE6] text-[#242823] border border-[#E7E1D7]">
                            {tx.category.name}
                          </span>
                        ) : (
                          <span className="text-[#777A72] text-[11px] italic">Sem classificação</span>
                        )}
                      </td>

                      {/* Amount Tabular Aligned Right */}
                      <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                        <span className={isIncome ? 'text-[#245A3C]' : 'text-[#242823]'}>
                          {isIncome ? `+${formatCurrency(tx.amount)}` : formatCurrency(tx.amount)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Contextual Transaction Detail Drawer */}
      {selectedTransaction && (
        <div className="p-5 rounded-lg border border-[#D6CFC2] bg-[#FFFFFF] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#242823] font-sans">
                {selectedTransaction.description}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F0EDE6] text-[#5F635C] border border-[#E7E1D7]">
                ID: {selectedTransaction.id.slice(0, 16)}...
              </span>
            </div>
            <div className="text-xs text-[#5F635C] font-sans flex items-center gap-4">
              <span>Data: {formatDate(selectedTransaction.date)}</span>
              <span>•</span>
              <span>Conta: {selectedTransaction.account?.name || 'Conta Padrão'}</span>
              <span>•</span>
              <span>Categoria: {selectedTransaction.category?.name || 'Geral'}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[10px] text-[#777A72] uppercase font-sans font-semibold">Valor Registrado</div>
              <div className={`font-mono text-base font-bold tabular-nums ${selectedTransaction.amount > 0 ? 'text-[#245A3C]' : 'text-[#242823]'}`}>
                {formatCurrency(selectedTransaction.amount)}
              </div>
            </div>

            <button
              onClick={() => setSelectedTransaction(null)}
              className="p-1.5 rounded-md border border-[#E7E1D7] text-[#5F635C] hover:text-[#242823] hover:bg-[#F3F1EB]"
              title="Fechar detalhe"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
