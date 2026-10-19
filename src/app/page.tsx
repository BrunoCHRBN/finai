'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { DashboardView } from '@/components/DashboardView';
import { BudgetsView } from '@/components/BudgetsView';
import { TransactionsView } from '@/components/TransactionsView';
import { OpenFinanceView } from '@/components/OpenFinanceView';
import { CopilotView } from '@/components/CopilotView';
import { PatrimonyView } from '@/components/PatrimonyView';
import { MarketIntelligenceView } from '@/components/market/MarketIntelligenceView';
import { CommandPalette } from '@/components/CommandPalette';
import { NewTransactionModal } from '@/components/NewTransactionModal';
import { NewPatrimonialItemModal } from '@/components/NewPatrimonialItemModal';
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
  const [cashFlowProjection, setCashFlowProjection] = useState<any | null>(null);
  const [latestDiagnosis, setLatestDiagnosis] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Operation flags
  const [isSyncingPluggy, setIsSyncingPluggy] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // Modals and drawer state
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isNewTxModalOpen, setIsNewTxModalOpen] = useState(false);
  const [isPluggyModalOpen, setIsPluggyModalOpen] = useState(false);
  const [isPatrimonyModalOpen, setIsPatrimonyModalOpen] = useState(false);
  const [patrimonyModalType, setPatrimonyModalType] = useState<'ASSET' | 'LIABILITY'>('ASSET');

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
      setCashFlowProjection(data.cashFlowProjection || null);

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
      const targetItemId = itemId || 'item-pluggy-sync';
      await fetch('/api/pluggy/sync', {
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

  // Toggle Ignore Transaction
  const handleToggleIgnoreTransaction = async (txId: string, currentIgnored: boolean | number) => {
    const targetIgnored = currentIgnored === 1 || currentIgnored === true ? 0 : 1;
    const res = await fetch(`/api/transactions/${txId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isIgnored: targetIgnored }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao alterar estado da movimentação');
    }
    await loadFinancialData();
  };

  // Delete Manual Transaction
  const handleDeleteTransaction = async (txId: string) => {
    const res = await fetch(`/api/transactions/${txId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao excluir transação');
    }
    await loadFinancialData();
  };

  // Update Category Budget Limit
  const handleUpdateCategoryBudget = async (categoryId: string, newLimit: number) => {
    const res = await fetch('/api/budgets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: currentMonth,
        categoryId,
        budgetLimit: newLimit,
        plannedAmount: newLimit,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao atualizar orçamento');
    }
    await loadFinancialData();
  };

  // Loading State
  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#F6F3ED] text-[#242823] gap-3 font-sans">
        <Loader2 className="w-6 h-6 animate-spin text-[#253A32]" />
        <span className="text-xs font-medium text-[#5F635C]">Carregando dados patrimoniais...</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F6F3ED] text-[#242823] overflow-hidden font-sans">
      {/* 1. Responsive Sidebar (Persistent on Desktop, Drawer on Mobile/Tablet) */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        maturityLevel={metrics?.maturityLevel || 2}
        tokenCount={latestDiagnosis?.tokenCount || 0}
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header with Hamburger for Mobile */}
        <Header
          metrics={metrics}
          currentMonth={currentMonth}
          isSyncingPluggy={isSyncingPluggy}
          isGeneratingAI={isGeneratingAI}
          onSyncPluggy={() => setIsPluggyModalOpen(true)}
          onRunAIDiagnosis={handleRunAIDiagnosis}
          onOpenNewTxModal={() => setIsNewTxModalOpen(true)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onToggleMobileMenu={() => setIsMobileSidebarOpen((prev) => !prev)}
        />

        {/* Scrollable View Content with Fluid Responsive Padding */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-5 md:p-6 lg:p-8 bg-[#F6F3ED]">
          <div className="w-full max-w-[1520px] mx-auto">
            {currentTab === 'dashboard' && metrics && (
              <DashboardView
                metrics={metrics}
                diagnosis={latestDiagnosis}
                goals={goals}
                cashFlowProjection={cashFlowProjection}
                recentTransactions={transactions.slice(0, 5)}
                currentMonth={currentMonth}
                onOpenNewTxModal={() => setIsNewTxModalOpen(true)}
                onOpenAIDiagnosis={handleRunAIDiagnosis}
                onSelectTab={setCurrentTab}
              />
            )}

            {currentTab === 'patrimony' && (
              <PatrimonyView
                onOpenNewAssetModal={() => {
                  setPatrimonyModalType('ASSET');
                  setIsPatrimonyModalOpen(true);
                }}
                onOpenNewLiabilityModal={() => {
                  setPatrimonyModalType('LIABILITY');
                  setIsPatrimonyModalOpen(true);
                }}
              />
            )}

            {currentTab === 'budgets' && metrics && (
              <BudgetsView
                metrics={metrics}
                categories={categories}
                currentMonth={currentMonth}
                onChangeMonth={setCurrentMonth}
                onUpdateCategoryBudget={handleUpdateCategoryBudget}
                onRefreshParent={loadFinancialData}
              />
            )}

            {currentTab === 'transactions' && (
              <TransactionsView
                transactions={transactions}
                accounts={accounts}
                categories={categories}
                onOpenNewTxModal={() => setIsNewTxModalOpen(true)}
                onToggleIgnore={handleToggleIgnoreTransaction}
                onDeleteTx={handleDeleteTransaction}
              />
            )}

            {currentTab === 'openfinance' && (
              <OpenFinanceView
                accounts={accounts}
                isSyncing={isSyncingPluggy}
                onSync={(itemId) => handleSyncPluggy(itemId)}
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

            {currentTab === 'market' && (
              <MarketIntelligenceView />
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

      <NewPatrimonialItemModal
        isOpen={isPatrimonyModalOpen}
        onClose={() => setIsPatrimonyModalOpen(false)}
        onItemCreated={() => {
          loadFinancialData();
        }}
        initialType={patrimonyModalType}
      />
    </div>
  );
}
