'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { DashboardView } from '@/components/DashboardView';
import { BudgetsView } from '@/components/BudgetsView';
import { TransactionsView } from '@/components/TransactionsView';
import { OpenFinanceView } from '@/components/OpenFinanceView';
import { CopilotView } from '@/components/CopilotView';
import { CommandPalette } from '@/components/CommandPalette';
import { NewTransactionModal } from '@/components/NewTransactionModal';
import { PluggyConnectModal } from '@/components/PluggyConnectModal';
import { FinancialMetrics } from '@/lib/ai/math-engine';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [currentMonth, setCurrentMonth] = useState<string>('2026-10');
  
  // Data state
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [latestDiagnosis, setLatestDiagnosis] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Operation flags
  const [isSyncingPluggy, setIsSyncingPluggy] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // Modals state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isNewTxModalOpen, setIsNewTxModalOpen] = useState(false);
  const [isPluggyModalOpen, setIsPluggyModalOpen] = useState(false);

  // Fetch initial summary
  const loadFinancialData = async () => {
    try {
      const res = await fetch(`/api/financial-summary?month=${currentMonth}`);
      if (!res.ok) throw new Error('Failed to load data');
      const data = await res.json();
      setMetrics(data.metrics);
      setAccounts(data.accounts || []);
      setCategories(data.categories || []);
      setTransactions(data.transactions || []);
      setGoals(data.goals || []);

      if (data.latestDiagnosis) {
        setLatestDiagnosis({
          status: 'ATTENTION',
          headline: 'Diagnóstico Consolidado do Mês',
          summary: data.latestDiagnosis.summary,
          priorityActions: JSON.parse(data.latestDiagnosis.actionableSteps || '[]'),
          tokenCount: data.latestDiagnosis.tokenCount,
          modelUsed: 'gemini-flash-lite',
          nextMilestone: 'Manter taxa de poupança acima de 20%',
        });
      }
    } catch (err) {
      console.error('Error fetching financial data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFinancialData();
  }, [currentMonth]);

  // Run Token-Efficient AI Diagnosis
  const handleRunAIDiagnosis = async () => {
    setIsGeneratingAI(true);
    try {
      const res = await fetch('/api/ai/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: currentMonth }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro no diagnóstico');

      setLatestDiagnosis(data.diagnosis);
      setMetrics(data.metrics);
    } catch (err: any) {
      alert(`Falha ao gerar diagnóstico: ${err.message}`);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Sync Pluggy Accounts & Transactions
  const handleSyncPluggy = async (itemId?: string) => {
    setIsSyncingPluggy(true);
    try {
      // If no itemId provided, use a default item or simulate sync
      const targetItemId = itemId || 'item-pluggy-sync';
      const res = await fetch('/api/pluggy/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: targetItemId }),
      });
      await loadFinancialData();
    } catch (err) {
      console.warn('Sync failed:', err);
    } finally {
      setIsSyncingPluggy(false);
    }
  };

  // Add Transaction
  const handleAddTransaction = async (txData: any) => {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txData),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao registrar transação');
    }
    await loadFinancialData();
  };

  // Update Category Budget Limit
  const handleUpdateCategoryBudget = async (categoryId: string, newLimit: number) => {
    const res = await fetch('/api/budgets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId, budgetLimit: newLimit }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao atualizar orçamento');
    }
    await loadFinancialData();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#090b0e] flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        <span className="text-xs font-mono">Carregando FinAI Platform...</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#090b0e] text-slate-100 overflow-hidden font-sans">
      {/* 1. Desktop Persistent Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        maturityLevel={metrics?.maturityLevel || 2}
        tokenCount={latestDiagnosis?.tokenCount || 0}
      />

      {/* 2. Main Desktop Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header
          metrics={metrics}
          currentMonth={currentMonth}
          isSyncingPluggy={isSyncingPluggy}
          isGeneratingAI={isGeneratingAI}
          onSyncPluggy={() => setIsPluggyModalOpen(true)}
          onRunAIDiagnosis={handleRunAIDiagnosis}
          onOpenNewTxModal={() => setIsNewTxModalOpen(true)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        />

        {/* Scrollable View Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {currentTab === 'dashboard' && metrics && (
              <DashboardView
                metrics={metrics}
                diagnosis={latestDiagnosis}
                goals={goals}
                onOpenNewTxModal={() => setIsNewTxModalOpen(true)}
                onOpenAIDiagnosis={handleRunAIDiagnosis}
              />
            )}

            {currentTab === 'budgets' && metrics && (
              <BudgetsView
                metrics={metrics}
                categories={categories}
                onUpdateCategoryBudget={handleUpdateCategoryBudget}
              />
            )}

            {currentTab === 'transactions' && (
              <TransactionsView
                transactions={transactions}
                accounts={accounts}
                categories={categories}
                onOpenNewTxModal={() => setIsNewTxModalOpen(true)}
              />
            )}

            {currentTab === 'openfinance' && (
              <OpenFinanceView
                accounts={accounts}
                isSyncing={isSyncingPluggy}
                onSync={() => handleSyncPluggy()}
                onOpenPluggyConnect={() => setIsPluggyModalOpen(true)}
              />
            )}

            {currentTab === 'copilot' && metrics && (
              <CopilotView
                metrics={metrics}
                diagnosis={latestDiagnosis}
                onRunDiagnosis={handleRunAIDiagnosis}
                isGenerating={isGeneratingAI}
              />
            )}
          </div>
        </main>
      </div>

      {/* 3. Modals */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectTab={(tab) => {
          setCurrentTab(tab);
          setIsCommandPaletteOpen(false);
        }}
        onOpenNewTxModal={() => setIsNewTxModalOpen(true)}
        onSyncPluggy={() => setIsPluggyModalOpen(true)}
        onRunAIDiagnosis={handleRunAIDiagnosis}
      />

      <NewTransactionModal
        isOpen={isNewTxModalOpen}
        onClose={() => setIsNewTxModalOpen(false)}
        accounts={accounts}
        categories={categories}
        onAddTransaction={handleAddTransaction}
      />

      <PluggyConnectModal
        isOpen={isPluggyModalOpen}
        onClose={() => setIsPluggyModalOpen(false)}
        onSuccessSync={handleSyncPluggy}
      />
    </div>
  );
}
