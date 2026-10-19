'use client';

import React, { useState, useMemo } from 'react';
import { 
  Search, 
  ArrowUpRight, 
  ArrowDownRight, 
  ArrowLeftRight,
  Plus,
  Landmark,
  X,
  EyeOff,
  Eye,
  Trash2
} from 'lucide-react';
import { isIncomeTransaction, isExpenseTransaction, isTransferTransaction, isIgnoredTransaction } from '@/lib/transactions';
import { PageHeader } from './ui/PageHeader';
import { StatusBadge } from './ui/StatusBadge';
import { FinancialDataTable } from './ui/FinancialDataTable';
import { EmptyState } from './ui/EmptyState';

interface TransactionsViewProps {
  transactions: any[];
  accounts: any[];
  categories: any[];
  onOpenNewTxModal: () => void;
  onToggleIgnore?: (txId: string, currentIgnored: boolean | number) => Promise<void>;
  onDeleteTx?: (txId: string) => Promise<void>;
}

export function TransactionsView({
  transactions,
  accounts,
  categories,
  onOpenNewTxModal,
  onToggleIgnore,
  onDeleteTx,
}: TransactionsViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedTransaction, setSelectedTransaction] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

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
      if (selectedType === 'INCOME') {
        if (!isIncomeTransaction(tx)) return false;
      } else if (selectedType === 'EXPENSE') {
        if (!isExpenseTransaction(tx)) return false;
      } else if (selectedType === 'TRANSFER') {
        if (!isTransferTransaction(tx)) return false;
      } else if (selectedType === 'IGNORED') {
        if (!isIgnoredTransaction(tx)) return false;
      }

      return true;
    });
  }, [transactions, searchTerm, selectedAccount, selectedCategory, selectedType]);

  // Aggregate stats for current filter (excluding ignored and transfer from operating stats)
  const stats = useMemo(() => {
    let income = 0;
    let expense = 0;
    let transfers = 0;
    filteredTransactions.forEach((t) => {
      if (isIgnoredTransaction(t)) return;
      const absAmount = Math.abs(t.amount || 0);
      if (isTransferTransaction(t)) {
        transfers += absAmount;
      } else if (isIncomeTransaction(t)) {
        income += absAmount;
      } else if (isExpenseTransaction(t)) {
        expense += absAmount;
      }
    });
    return {
      count: filteredTransactions.length,
      income,
      expense,
      transfers,
      balance: income - expense,
    };
  }, [filteredTransactions]);

  const handleToggleIgnoreAction = async (tx: any) => {
    if (!onToggleIgnore) return;
    setIsProcessing(true);
    try {
      await onToggleIgnore(tx.id, tx.isIgnored);
      setSelectedTransaction((prev: any) => prev ? { ...prev, isIgnored: prev.isIgnored === 1 ? 0 : 1 } : null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao alterar estado da movimentação');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteAction = async (tx: any) => {
    if (!onDeleteTx) return;
    if (!confirm('Deseja realmente excluir este lançamento manual? O saldo da conta será recalculado.')) return;
    setIsProcessing(true);
    try {
      await onDeleteTx(tx.id);
      setSelectedTransaction(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir lançamento');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header: PageHeader Component */}
      <PageHeader
        kicker="Auditoria & Conciliação"
        title="Movimentações Financeiras"
        description="Registro unificado com reconciliação de transferências próprias, cartões e lançamentos manuais."
        actions={
          <button
            onClick={onOpenNewTxModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#253A32] hover:bg-[#1B2B25] text-white text-xs font-sans font-medium transition-colors shadow-xs cursor-pointer min-h-[38px]"
          >
            <Plus className="w-3.5 h-3.5 text-white" />
            <span>Registrar Movimentação</span>
          </button>
        }
      />

      {/* 2. Responsive Analytical Filter & Search Bar */}
      <div className="p-4 sm:p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-4">
        {/* Top row: search + selects */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="relative md:col-span-6">
            <Search className="w-4 h-4 text-[#777A72] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por estabelecimento, credor ou descrição..."
              className="w-full pl-9 pr-4 py-2 rounded-md bg-[#F6F3ED] border border-[#E7E1D7] text-xs font-sans text-[#242823] placeholder-[#777A72] focus:outline-none focus:border-[#253A32] transition-colors"
            />
          </div>

          {/* Account Filter */}
          <div className="md:col-span-3">
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[#FFFFFF] border border-[#E7E1D7] text-xs font-sans text-[#242823] focus:outline-none focus:border-[#253A32]"
            >
              <option value="ALL">Todas as Contas ({accounts.length})</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div className="md:col-span-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[#FFFFFF] border border-[#E7E1D7] text-xs font-sans text-[#242823] focus:outline-none focus:border-[#253A32]"
            >
              <option value="ALL">Todas as Categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bottom row: Type Segmented Control with contained scroll on mobile */}
        <div className="flex items-center overflow-x-auto no-scrollbar pb-1">
          <div className="inline-flex rounded-md bg-[#F0EDE6] border border-[#E7E1D7] p-0.5 text-xs font-sans">
            <button
              onClick={() => setSelectedType('ALL')}
              className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                selectedType === 'ALL'
                  ? 'bg-[#FFFFFF] text-[#242823] shadow-xs'
                  : 'text-[#5F635C] hover:text-[#242823]'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setSelectedType('INCOME')}
              className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                selectedType === 'INCOME'
                  ? 'bg-[#FFFFFF] text-[#245A3C] shadow-xs'
                  : 'text-[#5F635C] hover:text-[#242823]'
              }`}
            >
              Entradas
            </button>
            <button
              onClick={() => setSelectedType('EXPENSE')}
              className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                selectedType === 'EXPENSE'
                  ? 'bg-[#FFFFFF] text-[#963F36] shadow-xs'
                  : 'text-[#5F635C] hover:text-[#242823]'
              }`}
            >
              Saídas
            </button>
            <button
              onClick={() => setSelectedType('TRANSFER')}
              className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                selectedType === 'TRANSFER'
                  ? 'bg-[#FFFFFF] text-[#2563EB] shadow-xs'
                  : 'text-[#5F635C] hover:text-[#242823]'
              }`}
            >
              Transferências
            </button>
            <button
              onClick={() => setSelectedType('IGNORED')}
              className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                selectedType === 'IGNORED'
                  ? 'bg-[#FFFFFF] text-[#777A72] shadow-xs'
                  : 'text-[#5F635C] hover:text-[#242823]'
              }`}
            >
              Desconsideradas
            </button>
          </div>
        </div>

        {/* Filter Summary Row */}
        <div className="pt-3 border-t border-[#F0EDE6] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-sans text-[#5F635C]">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
            Resultado Operacional: <strong className={stats.balance >= 0 ? 'text-[#245A3C]' : 'text-[#963F36]'}>{formatCurrency(stats.balance)}</strong>
          </div>
        </div>
      </div>

      {/* 3. Structured Data Ledger wrapped in FinancialDataTable */}
      <FinancialDataTable
        title="Extrato de Lançamentos"
        description="Detalhamento individual de débitos, créditos e transferências com auditoria de saldo."
      >
        <table className="w-full text-left text-xs font-sans border-collapse min-w-[620px]">
          <thead>
            <tr className="border-b border-[#E7E1D7] bg-[#F6F3ED] text-[#777A72] text-[11px] font-sans font-semibold tracking-wider uppercase">
              <th className="py-2.5 px-4 w-28">Data</th>
              <th className="py-2.5 px-4">Estabelecimento / Descrição</th>
              <th className="py-2.5 px-4 w-44">Instituição</th>
              <th className="py-2.5 px-4 w-48">Categoria / Tipo</th>
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
                const isIncome = isIncomeTransaction(tx);
                const isTransfer = isTransferTransaction(tx);
                const isIgnored = isIgnoredTransaction(tx);
                const isSelected = selectedTransaction?.id === tx.id;

                return (
                  <tr
                    key={tx.id}
                    onClick={() => setSelectedTransaction(tx)}
                    className={`cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-[#F0EDE6]' 
                        : isIgnored
                          ? 'bg-[#FAFAF8] opacity-60 hover:bg-[#F3F1EB]'
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
                        <div className={`p-1 rounded shrink-0 ${
                          isIgnored 
                            ? 'bg-[#E7E1D7] text-[#777A72]'
                            : isTransfer 
                              ? 'bg-[#EFF6FF] text-[#2563EB]' 
                              : isIncome 
                                ? 'bg-[#E4EFE6] text-[#245A3C]' 
                                : 'bg-[#F0EDE6] text-[#5F635C]'
                        }`}>
                          {isTransfer ? (
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                          ) : isIncome ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <span className={`font-medium truncate ${isIgnored ? 'line-through text-[#777A72]' : 'text-[#242823]'}`} title={tx.description}>
                          {tx.description}
                        </span>
                        {isIgnored && (
                          <span className="shrink-0 text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#E7E1D7] text-[#5F635C]">
                            Desconsiderada
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Account */}
                    <td className="py-2.5 px-4 text-[#5F635C] whitespace-nowrap">
                      <div className="flex items-center gap-1.5 truncate">
                        <Landmark className="w-3.5 h-3.5 text-[#777A72] shrink-0" />
                        <span className="truncate">{tx.account?.name || 'Conta Reconciliada'}</span>
                      </div>
                    </td>

                    {/* Category & Badges */}
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {isTransfer ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-sans font-medium bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
                            Transferência Interna
                          </span>
                        ) : tx.category ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-sans font-medium bg-[#F0EDE6] text-[#242823] border border-[#E7E1D7]">
                            {tx.category.name}
                          </span>
                        ) : (
                          <span className="text-[#777A72] text-[11px] italic">Sem classificação</span>
                        )}
                      </div>
                    </td>

                    {/* Amount Tabular Aligned Right */}
                    <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                      <span className={
                        isIgnored 
                          ? 'text-[#777A72] line-through'
                          : isTransfer 
                            ? (tx.amount >= 0 ? 'text-[#1D4ED8]' : 'text-[#5F635C]')
                            : isIncome 
                              ? 'text-[#245A3C]' 
                              : 'text-[#963F36]'
                      }>
                        {tx.amount > 0 ? `+${formatCurrency(Math.abs(tx.amount))}` : `-${formatCurrency(Math.abs(tx.amount))}`}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </FinancialDataTable>

      {/* 4. Contextual Transaction Detail Drawer */}
      {selectedTransaction && (
        <div className="p-4 sm:p-5 rounded-lg border border-[#D6CFC2] bg-[#FFFFFF] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[#242823] font-sans">
                {selectedTransaction.description}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F0EDE6] text-[#5F635C] border border-[#E7E1D7]">
                ID: {selectedTransaction.id.slice(0, 16)}...
              </span>
              {selectedTransaction.type === 'TRANSFER' && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
                  Transferência Própria
                </span>
              )}
              {isIgnoredTransaction(selectedTransaction) && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]">
                  Desconsiderada das Métricas
                </span>
              )}
            </div>
            <div className="text-xs text-[#5F635C] font-sans flex flex-wrap items-center gap-2 sm:gap-4">
              <span>Data: {formatDate(selectedTransaction.date)}</span>
              <span>•</span>
              <span>Conta: {selectedTransaction.account?.name || 'Conta Padrão'}</span>
              <span>•</span>
              <span>Classificação: {selectedTransaction.type === 'TRANSFER' ? 'Transferência' : (selectedTransaction.category?.name || 'Geral')}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-[#E7E1D7]">
            <div className="flex items-center gap-2">
              {/* Toggle Ignore Button */}
              {onToggleIgnore && (
                <button
                  onClick={() => handleToggleIgnoreAction(selectedTransaction)}
                  disabled={isProcessing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#E7E1D7] text-xs font-sans text-[#5F635C] hover:text-[#242823] hover:bg-[#F3F1EB] transition-colors cursor-pointer min-h-[36px]"
                  title={selectedTransaction.isIgnored === 1 ? 'Restaurar cálculo financeiro' : 'Ignorar do cálculo financeiro'}
                >
                  {selectedTransaction.isIgnored === 1 ? (
                    <>
                      <Eye className="w-3.5 h-3.5 text-[#245A3C]" />
                      <span>Restaurar</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-[#777A72]" />
                      <span>Desconsiderar</span>
                    </>
                  )}
                </button>
              )}

              {/* Delete Manual Transaction Button */}
              {onDeleteTx && !selectedTransaction.pluggyTransactionId && (
                <button
                  onClick={() => handleDeleteAction(selectedTransaction)}
                  disabled={isProcessing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#FECACA] bg-[#FEF2F2] text-[#991B1B] hover:bg-[#FEE2E2] text-xs font-sans transition-colors cursor-pointer min-h-[36px]"
                  title="Excluir lançamento manual e recalcular saldo da conta"
                >
                  <Trash2 className="w-3.5 h-3.5 text-[#991B1B]" />
                  <span>Excluir</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right pl-3 border-l border-[#E7E1D7]">
                <div className="text-[10px] text-[#777A72] uppercase font-sans font-semibold">Valor Registrado</div>
                <div className={`font-mono text-base font-bold tabular-nums ${
                  isIgnoredTransaction(selectedTransaction)
                    ? 'text-[#777A72] line-through'
                    : selectedTransaction.type === 'TRANSFER'
                      ? (selectedTransaction.amount >= 0 ? 'text-[#1D4ED8]' : 'text-[#5F635C]')
                      : isIncomeTransaction(selectedTransaction)
                        ? 'text-[#245A3C]'
                        : 'text-[#963F36]'
                }`}>
                  {selectedTransaction.amount > 0
                    ? `+${formatCurrency(Math.abs(selectedTransaction.amount))}`
                    : `-${formatCurrency(Math.abs(selectedTransaction.amount))}`}
                </div>
              </div>

              <button
                onClick={() => setSelectedTransaction(null)}
                className="p-1.5 rounded-md border border-[#E7E1D7] text-[#5F635C] hover:text-[#242823] hover:bg-[#F3F1EB] cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                title="Fechar detalhe"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
