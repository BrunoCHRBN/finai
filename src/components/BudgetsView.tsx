'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  Target,
  TrendingUp,
  Calculator,
  Bell,
  PieChart,
  Layers,
  Plus,
  Clock,
  History,
  Lock,
  Unlock,
  Trash2,
  Edit3,
  RefreshCw,
  Info,
  Sliders,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import { FinancialMetrics } from '@/lib/ai/math-engine';
import { PageHeader } from './ui/PageHeader';

interface BudgetsViewProps {
  metrics: FinancialMetrics;
  categories: any[];
  currentMonth?: string;
  onChangeMonth?: (month: string) => void;
  onUpdateCategoryBudget: (categoryId: string, newLimit: number) => Promise<void>;
  onRefreshParent?: () => Promise<void>;
}

type PlanningSection =
  | 'overview'
  | 'budgets'
  | 'goals'
  | 'cashflow'
  | 'recurring'
  | 'simulator'
  | 'alerts';

export function BudgetsView({
  currentMonth: propMonth,
  onChangeMonth,
  onRefreshParent,
}: BudgetsViewProps) {
  const [activeSection, setActiveSection] = useState<PlanningSection>('overview');
  const [selectedMonth, setSelectedMonth] = useState<string>(propMonth || '2026-10');
  const [horizonMonths, setHorizonMonths] = useState<number>(6);

  // Server data state
  const [planningData, setPlanningData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Budget inline edit state
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editBudgetAmount, setEditBudgetAmount] = useState<string>('');
  const [editBudgetName, setEditBudgetName] = useState<string>('');
  const [editBudgetNote, setEditBudgetNote] = useState<string>('');
  const [historyCategoryId, setHistoryCategoryId] = useState<string | null>(null);
  const [isSavingBudget, setIsSavingBudget] = useState<boolean>(false);

  // Goal form state
  const [isGoalFormOpen, setIsGoalFormOpen] = useState<boolean>(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalTitle, setGoalTitle] = useState<string>('');
  const [goalPurpose, setGoalPurpose] = useState<string>('');
  const [goalTarget, setGoalTarget] = useState<string>('');
  const [goalCurrent, setGoalCurrent] = useState<string>('0');
  const [goalMonthlyContrib, setGoalMonthlyContrib] = useState<string>('0');
  const [goalDeadline, setGoalDeadline] = useState<string>('');
  const [goalCategory, setGoalCategory] = useState<string>('EMERGENCY');
  const [goalPriority, setGoalPriority] = useState<string>('1');
  const [goalStatus, setGoalStatus] = useState<string>('ACTIVE');
  const [isSavingGoal, setIsSavingGoal] = useState<boolean>(false);

  // Recurring flow and occurrences state
  const [isRecurringFormOpen, setIsRecurringFormOpen] = useState<boolean>(false);
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const [recTitle, setRecTitle] = useState<string>('');
  const [recType, setRecType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [recNature, setRecNature] = useState<'CONFIRMED' | 'ESTIMATED'>('CONFIRMED');
  const [recAmount, setRecAmount] = useState<string>('');
  const [recAmountType, setRecAmountType] = useState<'FIXED' | 'VARIABLE'>('FIXED');
  const [recFrequency, setRecFrequency] = useState<
    'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'ONCE'
  >('MONTHLY');
  const [recDayOfMonth, setRecDayOfMonth] = useState<string>('5');
  const [recSecondDayOfMonth, setRecSecondDayOfMonth] = useState<string>('20');
  const [recStartDate, setRecStartDate] = useState<string>('');
  const [recNextDate, setRecNextDate] = useState<string>('');
  const [recEndDate, setRecEndDate] = useState<string>('');
  const [recStartMonth, setRecStartMonth] = useState<string>(propMonth || '2026-10');
  const [recEndMonth, setRecEndMonth] = useState<string>('');
  const [recInstallments, setRecInstallments] = useState<string>('');
  const [recDestinationAccountId, setRecDestinationAccountId] = useState<string>('');
  const [recIncomeCategory, setRecIncomeCategory] = useState<string>('SALARY');
  const [isSavingRecurring, setIsSavingRecurring] = useState<boolean>(false);

  // Occurrences and reconciliation state
  const [occurrencesList, setOccurrencesList] = useState<any[]>([]);
  const [occFilter, setOccFilter] = useState<'ALL' | 'PENDING' | 'OVERDUE' | 'RECONCILED' | 'MANUALLY_CONFIRMED'>('ALL');
  const [isReconciling, setIsReconciling] = useState<boolean>(false);

  // Simulator state
  const [simInitialCapital, setSimInitialCapital] = useState<string>('0');
  const [simMonthlyContribution, setSimMonthlyContribution] = useState<string>('1000');
  const [simHorizonMonths, setSimHorizonMonths] = useState<string>('120');
  const [simNominalReturn, setSimNominalReturn] = useState<string>('10.5');
  const [simInflation, setSimInflation] = useState<string>('4.5');
  const [simDesiredIncome, setSimDesiredIncome] = useState<string>('5000');
  const [simWithdrawalRate, setSimWithdrawalRate] = useState<string>('4.0');
  const [simResult, setSimResult] = useState<any | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simInitialized, setSimInitialized] = useState<boolean>(false);

  // Alert threshold preferences form state
  const [prefMinLiquidity, setPrefMinLiquidity] = useState<string>('1000');
  const [prefWarningPct, setPrefWarningPct] = useState<string>('80');
  const [prefCriticalPct, setPrefCriticalPct] = useState<string>('100');
  const [prefStaleDays, setPrefStaleDays] = useState<string>('7');
  const [prefDueDays, setPrefDueDays] = useState<string>('7');
  const [isSavingPrefs, setIsSavingPrefs] = useState<boolean>(false);

  useEffect(() => {
    if (propMonth && propMonth !== selectedMonth) {
      setSelectedMonth(propMonth);
    }
  }, [propMonth]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  const fetchPlanningData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/planning?month=${encodeURIComponent(selectedMonth)}&horizon=${horizonMonths}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao carregar dados de planejamento');
      }
      setPlanningData(data);

      try {
        const occRes = await fetch('/api/planning/occurrences');
        if (occRes.ok) {
          const occData = await occRes.json();
          setOccurrencesList(occData.occurrences || []);
        }
      } catch (occErr) {
        console.warn('Erro ao carregar ocorrências:', occErr);
      }

      if (!simInitialized && data.defaultSimulation) {
        setSimInitialCapital(String(data.defaultSimulation.inputs.initialCapital));
        setSimMonthlyContribution(String(data.defaultSimulation.inputs.monthlyContribution));
        setSimHorizonMonths(String(data.defaultSimulation.inputs.horizonMonths));
        setSimNominalReturn(String(data.defaultSimulation.inputs.annualNominalReturnPct));
        setSimInflation(String(data.defaultSimulation.inputs.annualInflationPct));
        setSimDesiredIncome(String(data.defaultSimulation.inputs.desiredMonthlyIncome));
        setSimWithdrawalRate(String(data.defaultSimulation.inputs.safeWithdrawalRatePct));
        setSimResult(data.defaultSimulation);
        setSimInitialized(true);
      }

      if (data.preferences) {
        setPrefMinLiquidity(String(data.preferences.minLiquidityThreshold ?? 1000));
        setPrefWarningPct(String(data.preferences.budgetWarningPct ?? 80));
        setPrefCriticalPct(String(data.preferences.budgetCriticalPct ?? 100));
        setPrefStaleDays(String(data.preferences.maxDataStalenessDays ?? 7));
        setPrefDueDays(String(data.preferences.liabilityDueSoonDays ?? 7));
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro inesperado ao carregar planejamento');
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth, horizonMonths, simInitialized]);

  useEffect(() => {
    fetchPlanningData();
  }, [fetchPlanningData]);

  const handleMonthSelect = (m: string) => {
    setSelectedMonth(m);
    if (onChangeMonth) onChangeMonth(m);
  };

  // --- Budget handlers ---
  const handleStartEditBudget = (item: any) => {
    setEditingCategoryId(item.categoryId);
    setEditBudgetAmount(String(item.plannedAmount));
    setEditBudgetName(item.budgetName || item.categoryName);
    setEditBudgetNote('');
  };

  const handleSaveBudget = async (categoryId: string, statusOverride?: 'ACTIVE' | 'CLOSED', currentPlanned?: number) => {
    const rawVal = statusOverride ? String(currentPlanned ?? 0) : editBudgetAmount;
    const num = parseFloat(rawVal.replace(',', '.'));
    if (Number.isNaN(num) || num < 0) {
      alert('Informe um valor orçamentário válido (maior ou igual a zero).');
      return;
    }

    setIsSavingBudget(true);
    try {
      const res = await fetch('/api/budgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          categoryId,
          plannedAmount: num,
          budgetLimit: num,
          name: editBudgetName || undefined,
          status: statusOverride || 'ACTIVE',
          note: editBudgetNote || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar orçamento');

      setEditingCategoryId(null);
      await fetchPlanningData();
      if (onRefreshParent) await onRefreshParent();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar orçamento');
    } finally {
      setIsSavingBudget(false);
    }
  };

  // --- Goal handlers ---
  const resetGoalForm = () => {
    setEditingGoalId(null);
    setGoalTitle('');
    setGoalPurpose('');
    setGoalTarget('');
    setGoalCurrent('0');
    setGoalMonthlyContrib('0');
    setGoalDeadline('');
    setGoalCategory('EMERGENCY');
    setGoalPriority('1');
    setGoalStatus('ACTIVE');
  };

  const handleOpenEditGoal = (g: any) => {
    setEditingGoalId(g.id);
    setGoalTitle(g.title);
    setGoalPurpose(g.purpose || '');
    setGoalTarget(String(g.targetAmount));
    setGoalCurrent(String(g.declaredCurrentAmount));
    setGoalMonthlyContrib(String(g.plannedMonthlyContribution));
    setGoalDeadline(g.deadline || '');
    setGoalCategory(g.category || 'EMERGENCY');
    setGoalPriority(String(g.priority || 1));
    setGoalStatus(g.status || 'ACTIVE');
    setIsGoalFormOpen(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingGoal(true);
    try {
      const payload = {
        title: goalTitle,
        purpose: goalPurpose,
        targetAmount: parseFloat(goalTarget.replace(',', '.')),
        currentAmount: parseFloat(goalCurrent.replace(',', '.')) || 0,
        plannedMonthlyContribution: parseFloat(goalMonthlyContrib.replace(',', '.')) || 0,
        deadline: goalDeadline || null,
        category: goalCategory,
        priority: parseInt(goalPriority, 10) || 1,
        status: goalStatus,
      };

      const url = editingGoalId ? `/api/goals/${editingGoalId}` : '/api/goals';
      const method = editingGoalId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar meta');

      setIsGoalFormOpen(false);
      resetGoalForm();
      await fetchPlanningData();
      if (onRefreshParent) await onRefreshParent();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar meta');
    } finally {
      setIsSavingGoal(false);
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    try {
      const res = await fetch(`/api/goals/${goalId}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Erro ao excluir meta');
      }
      await fetchPlanningData();
      if (onRefreshParent) await onRefreshParent();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir meta');
    }
  };

  // --- Recurring flow handlers ---
  const handleSaveRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingRecurring(true);
    try {
      const url = editingRecurringId
        ? `/api/planning/recurring/${editingRecurringId}`
        : '/api/planning/recurring';
      const method = editingRecurringId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: recTitle,
          type: recType,
          nature: recNature,
          amount: parseFloat(recAmount.replace(',', '.')),
          amountType: recAmountType,
          frequency: recFrequency,
          dayOfMonth: parseInt(recDayOfMonth, 10) || 5,
          secondDayOfMonth: recFrequency === 'SEMIMONTHLY' ? (parseInt(recSecondDayOfMonth, 10) || 20) : null,
          startDate: recStartDate || null,
          nextDate: recNextDate || null,
          endDate: recEndDate || null,
          startMonth: recStartMonth,
          endMonth: recEndMonth || null,
          totalInstallments: recInstallments ? parseInt(recInstallments, 10) : null,
          remainingInstallments: recInstallments ? parseInt(recInstallments, 10) : null,
          destinationAccountId: recDestinationAccountId || null,
          incomeCategory: recType === 'INCOME' ? recIncomeCategory : null,
          status: 'ACTIVE',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao registrar compromisso recorrente');

      setIsRecurringFormOpen(false);
      setEditingRecurringId(null);
      setRecTitle('');
      setRecAmount('');
      setRecType('EXPENSE');
      setRecNature('CONFIRMED');
      setRecAmountType('FIXED');
      setRecFrequency('MONTHLY');
      setRecDayOfMonth('5');
      setRecSecondDayOfMonth('20');
      setRecEndMonth('');
      setRecInstallments('');
      setRecStartDate('');
      setRecNextDate('');
      setRecEndDate('');
      setRecDestinationAccountId('');
      setRecIncomeCategory('SALARY');
      await fetchPlanningData();
      if (onRefreshParent) await onRefreshParent();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao registrar fluxo recorrente');
    } finally {
      setIsSavingRecurring(false);
    }
  };

  const handleEditRecurring = (rf: any) => {
    setEditingRecurringId(rf.id);
    setRecTitle(rf.title || '');
    setRecType(rf.type || 'EXPENSE');
    setRecNature(rf.nature || 'CONFIRMED');
    setRecAmount(String(rf.amount || ''));
    setRecAmountType(rf.amountType || 'FIXED');
    setRecFrequency(rf.frequency || 'MONTHLY');
    setRecDayOfMonth(String(rf.dayOfMonth || 5));
    setRecSecondDayOfMonth(rf.secondDayOfMonth ? String(rf.secondDayOfMonth) : '20');
    setRecStartDate(rf.startDate || '');
    setRecNextDate(rf.nextDate || '');
    setRecEndDate(rf.endDate || '');
    setRecStartMonth(rf.startMonth || selectedMonth);
    setRecEndMonth(rf.endMonth || '');
    setRecInstallments(rf.totalInstallments ? String(rf.totalInstallments) : '');
    setRecDestinationAccountId(rf.destinationAccountId || '');
    setRecIncomeCategory(rf.incomeCategory || 'SALARY');
    setIsRecurringFormOpen(true);
  };

  const handleEndRecurring = async (id: string) => {
    try {
      await fetch(`/api/planning/recurring/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ENDED', isActive: 0 }),
      });
      await fetchPlanningData();
      if (onRefreshParent) await onRefreshParent();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleRecurring = async (id: string, currentActive: number) => {
    try {
      await fetch(`/api/planning/recurring/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: currentActive === 1 ? 0 : 1 }),
      });
      await fetchPlanningData();
      if (onRefreshParent) await onRefreshParent();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteRecurring = async (id: string) => {
    try {
      await fetch(`/api/planning/recurring/${id}`, { method: 'DELETE' });
      await fetchPlanningData();
      if (onRefreshParent) await onRefreshParent();
    } catch (err) {
      console.error(err);
    }
  };

  // --- Occurrence Reconciliation handlers ---
  const handleReconcile = async (occurrenceId: string, transactionId: string, amount?: number) => {
    setIsReconciling(true);
    try {
      const res = await fetch('/api/planning/occurrences/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          occurrenceId,
          action: 'RECONCILE',
          transactionId,
          reconciledAmount: amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao conciliar ocorrência');
      await fetchPlanningData();
      if (onRefreshParent) await onRefreshParent();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao conciliar');
    } finally {
      setIsReconciling(false);
    }
  };

  const handleManualConfirm = async (occurrenceId: string) => {
    setIsReconciling(true);
    try {
      const res = await fetch('/api/planning/occurrences/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          occurrenceId,
          action: 'MANUALLY_CONFIRM',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao confirmar ocorrência');
      await fetchPlanningData();
      if (onRefreshParent) await onRefreshParent();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao confirmar');
    } finally {
      setIsReconciling(false);
    }
  };

  const handleUnreconcile = async (occurrenceId: string) => {
    setIsReconciling(true);
    try {
      const res = await fetch('/api/planning/occurrences/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          occurrenceId,
          action: 'UNRECONCILE',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao desfazer conciliação');
      await fetchPlanningData();
      if (onRefreshParent) await onRefreshParent();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao desfazer conciliação');
    } finally {
      setIsReconciling(false);
    }
  };

  // --- Simulator handler ---
  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSimulating(true);
    setSimError(null);
    try {
      const res = await fetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SIMULATE',
          initialCapital: parseFloat(simInitialCapital.replace(',', '.')),
          monthlyContribution: parseFloat(simMonthlyContribution.replace(',', '.')),
          horizonMonths: parseInt(simHorizonMonths, 10),
          annualNominalReturnPct: parseFloat(simNominalReturn.replace(',', '.')),
          annualInflationPct: parseFloat(simInflation.replace(',', '.')),
          desiredMonthlyIncome: parseFloat(simDesiredIncome.replace(',', '.')),
          safeWithdrawalRatePct: parseFloat(simWithdrawalRate.replace(',', '.')),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSimError(data.error || 'Parâmetros de simulação inválidos');
        if (data.result) setSimResult(data.result);
      } else {
        setSimResult(data.result);
      }
    } catch (err: unknown) {
      setSimError(err instanceof Error ? err.message : 'Erro ao executar simulação');
    } finally {
      setIsSimulating(false);
    }
  };

  // --- Alert handlers ---
  const handleToggleAlertStatus = async (fingerprint: string, currentStatus: string) => {
    try {
      const action = currentStatus === 'DISMISSED' ? 'RESTORE_ALERT' : 'DISMISS_ALERT';
      await fetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, fingerprint }),
      });
      await fetchPlanningData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveAlertPreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPrefs(true);
    try {
      const res = await fetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_PREFERENCES',
          minLiquidityThreshold: parseFloat(prefMinLiquidity.replace(',', '.')),
          budgetWarningPct: parseFloat(prefWarningPct.replace(',', '.')),
          budgetCriticalPct: parseFloat(prefCriticalPct.replace(',', '.')),
          maxDataStalenessDays: parseInt(prefStaleDays, 10),
          liabilityDueSoonDays: parseInt(prefDueDays, 10),
        }),
      });
      if (!res.ok) throw new Error('Falha ao atualizar limites de alerta');
      await fetchPlanningData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar limites');
    } finally {
      setIsSavingPrefs(false);
    }
  };

  if (isLoading && !planningData) {
    return (
      <div className="p-12 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] flex flex-col items-center justify-center gap-3 text-xs text-[#5F635C]">
        <RefreshCw className="w-5 h-5 animate-spin text-[#253A32]" />
        <span>Calculando motor determinístico de planejamento financeiro...</span>
      </div>
    );
  }

  if (errorMsg && !planningData) {
    return (
      <div className="p-6 rounded-lg border border-[#EED0CC] bg-[#F8E8E5] text-[#963F36] text-xs space-y-2">
        <div className="font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>Falha ao carregar o módulo de planejamento financeiro</span>
        </div>
        <p>{errorMsg}</p>
        <button
          onClick={fetchPlanningData}
          className="px-3 py-1.5 rounded bg-[#963F36] text-white font-medium text-xs"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const budgetSummary = planningData?.budgetSummary;
  const goalsSummary = planningData?.goalsSummary;
  const cashFlow = planningData?.cashFlowProjection;
  const alerts: any[] = planningData?.alerts || [];
  const activeAlerts = alerts.filter((a) => a.status === 'ACTIVE');
  const staleAlerts = activeAlerts.filter((a) => a.type === 'STALE_FINANCIAL_DATA');
  const recurringList: any[] = planningData?.recurringFlows || [];
  const overdueOccurrencesCount = occurrencesList.filter((o) => o.status === 'OVERDUE').length;

  const navTabs: Array<{ id: PlanningSection; label: string; icon: any; badge?: number }> = [
    { id: 'overview', label: 'Visão Geral', icon: Layers },
    { id: 'budgets', label: 'Orçamentos', icon: PieChart, badge: budgetSummary?.overBudgetCount || undefined },
    { id: 'goals', label: 'Metas Financeiras', icon: Target, badge: goalsSummary?.activeGoalsCount || undefined },
    { id: 'cashflow', label: 'Fluxo de Caixa Projetado', icon: TrendingUp },
    { id: 'recurring', label: 'Rendas & Recorrências', icon: Calendar, badge: overdueOccurrencesCount || undefined },
    { id: 'simulator', label: 'Simulador & IF', icon: Calculator },
    { id: 'alerts', label: 'Alertas & Limites', icon: Bell, badge: activeAlerts.length || undefined },
  ];

  const resetRecurringForm = () => {
    setIsRecurringFormOpen(false);
    setEditingRecurringId(null);
    setRecTitle('');
    setRecAmount('');
    setRecType('EXPENSE');
    setRecNature('CONFIRMED');
    setRecAmountType('FIXED');
    setRecFrequency('MONTHLY');
    setRecDayOfMonth('5');
    setRecStartDate('');
    setRecNextDate('');
    setRecEndDate('');
    setRecStartMonth(selectedMonth || '2026-10');
    setRecEndMonth('');
    setRecInstallments('');
    setRecDestinationAccountId('');
    setRecIncomeCategory('SALARY');
  };

  const renderRecurringForm = () => {
    if (!isRecurringFormOpen) return null;
    return (
      <form
        onSubmit={handleSaveRecurring}
        className="p-5 rounded-lg border border-[#253A32] bg-[#FFFFFF] space-y-4 text-xs shadow-xs"
      >
        <div className="flex items-center justify-between border-b border-[#E7E1D7] pb-2">
          <h3 className="font-serif text-base font-bold text-[#242823]">
            {editingRecurringId
              ? 'Editar Compromisso ou Fluxo Recorrente'
              : 'Novo Compromisso ou Fluxo Recorrente Configurado'}
          </h3>
          <button
            type="button"
            onClick={resetRecurringForm}
            className="text-[#777A72] hover:text-[#242823] cursor-pointer"
          >
            Fechar
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
              Descrição *
            </label>
            <input
              type="text"
              required
              value={recTitle}
              onChange={(e) => setRecTitle(e.target.value)}
              placeholder="Ex: Salário Mensal / Aluguel"
              className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
              Direção do Fluxo *
            </label>
            <select
              value={recType}
              onChange={(e) => setRecType(e.target.value as 'INCOME' | 'EXPENSE')}
              className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5]"
            >
              <option value="INCOME">Receita Recorrente (+)</option>
              <option value="EXPENSE">Despesa / Compromisso (-)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
              Classificação Epistêmica *
            </label>
            <select
              value={recNature}
              onChange={(e) => setRecNature(e.target.value as 'CONFIRMED' | 'ESTIMATED')}
              className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5]"
            >
              <option value="CONFIRMED">Confirmado / Programado (Base contratual)</option>
              <option value="ESTIMATED">Estimado (Hipótese projetada)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
              Valor (R$) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={recAmount}
              onChange={(e) => setRecAmount(e.target.value)}
              placeholder="2500.00"
              className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
              Tipo de Valor *
            </label>
            <select
              value={recAmountType}
              onChange={(e) => setRecAmountType(e.target.value as 'FIXED' | 'VARIABLE')}
              className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5]"
            >
              <option value="FIXED">Fixo (Valor exato)</option>
              <option value="VARIABLE">Variável (Média / Estimativa)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
              Frequência
            </label>
            <select
              value={recFrequency}
              onChange={(e) => setRecFrequency(e.target.value as any)}
              className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5]"
            >
              <option value="WEEKLY">Semanal (a cada 7 dias)</option>
              <option value="BIWEEKLY">A cada 14 dias (bi-semanal)</option>
              <option value="SEMIMONTHLY">Semimensal (2 datas fixas no mês)</option>
              <option value="MONTHLY">Mensal Recorrente</option>
              <option value="QUARTERLY">Trimestral</option>
              <option value="ANNUAL">Anual</option>
              <option value="ONCE">Evento Único no Mês Inicial</option>
            </select>
          </div>

          {recType === 'INCOME' && (
            <div>
              <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                Categoria de Renda
              </label>
              <select
                value={recIncomeCategory}
                onChange={(e) => setRecIncomeCategory(e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5]"
              >
                <option value="SALARY">Salário / Remuneração CLT</option>
                <option value="FREELANCE">Freelance / Prestação de Serviços</option>
                <option value="RENT">Aluguéis Recebidos</option>
                <option value="DIVIDENDS">Dividendos / Rendimentos</option>
                <option value="BENEFIT">Benefício / Aposentadoria</option>
                <option value="OTHER">Outras Receitas</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
              {recFrequency === 'SEMIMONTHLY' ? '1º Dia Previsto do Mês (1 - 31)' : 'Dia Previsto do Mês (1 - 31)'}
            </label>
            <input
              type="number"
              min="1"
              max="31"
              value={recDayOfMonth}
              onChange={(e) => setRecDayOfMonth(e.target.value)}
              placeholder="5"
              className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
            />
          </div>

          {recFrequency === 'SEMIMONTHLY' && (
            <div>
              <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                2º Dia Previsto do Mês (1 - 31)
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={recSecondDayOfMonth}
                onChange={(e) => setRecSecondDayOfMonth(e.target.value)}
                placeholder="20"
                className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
              Data de Início (Opcional)
            </label>
            <input
              type="date"
              value={recStartDate}
              onChange={(e) => setRecStartDate(e.target.value)}
              className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
              Mês Inicial (YYYY-MM)
            </label>
            <input
              type="month"
              value={recStartMonth}
              onChange={(e) => setRecStartMonth(e.target.value)}
              className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
              Mês Final Opcional
            </label>
            <input
              type="month"
              value={recEndMonth}
              onChange={(e) => setRecEndMonth(e.target.value)}
              className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
              Limite de Parcelas (Opcional)
            </label>
            <input
              type="number"
              min="1"
              value={recInstallments}
              onChange={(e) => setRecInstallments(e.target.value)}
              placeholder="Ex: 10"
              className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={resetRecurringForm}
            className="px-3 py-1.5 rounded border border-[#E7E1D7] text-[#5F635C] cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSavingRecurring}
            className="px-4 py-1.5 rounded bg-[#253A32] text-white font-medium cursor-pointer"
          >
            {isSavingRecurring
              ? 'Salvando...'
              : editingRecurringId
              ? 'Salvar Alterações'
              : 'Registrar Fluxo'}
          </button>
        </div>
      </form>
    );
  };

  const availableMonths = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];

  return (
    <div className="space-y-6">
      {/* 1. Header & Period Selector using PageHeader */}
      <PageHeader
        kicker="Planejamento Financeiro Prospectivo"
        title="Planejamento, Orçamentos, Metas & Projeções"
        description="Controle orçamentário por categoria, alocação de metas sem dupla contagem, projeção em 3 camadas e cenários reais."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#E7E1D7] bg-[#FFFFFF] text-xs min-h-[38px]">
              <Calendar className="w-3.5 h-3.5 text-[#253A32]" />
              <span className="text-[#777A72]">Vigência:</span>
              <select
                value={selectedMonth}
                onChange={(e) => handleMonthSelect(e.target.value)}
                className="font-mono font-semibold text-[#242823] bg-transparent focus:outline-none cursor-pointer"
              >
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={fetchPlanningData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[#E7E1D7] bg-[#FFFFFF] hover:bg-[#F3F1EB] text-xs font-medium text-[#242823] transition-colors cursor-pointer min-h-[38px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Recalcular</span>
            </button>
          </div>
        }
      />

      {/* Stale Data Banner if detected */}
      {staleAlerts.length > 0 && (
        <div className="p-3.5 rounded-lg border border-[#E8DEC7] bg-[#F5EEDB] flex items-center justify-between gap-3 text-xs text-[#795C24]">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 shrink-0" />
            <div>
              <span className="font-semibold">{staleAlerts[0].title}: </span>
              <span>{staleAlerts[0].reason}</span>
            </div>
          </div>
          <button
            onClick={() => setActiveSection('alerts')}
            className="px-2.5 py-1 rounded border border-[#D6C7A7] bg-[#FFFFFF] text-[#795C24] font-medium shrink-0 cursor-pointer"
          >
            Ver detalhes
          </button>
        </div>
      )}

      {/* 2. Sub-navigation Bar: Contained Horizontal Scroll on Mobile */}
      <div className="flex items-center overflow-x-auto no-scrollbar gap-1.5 p-1.5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-sans whitespace-nowrap shrink-0 transition-colors cursor-pointer min-h-[36px] ${
                isActive
                  ? 'bg-[#253A32] text-white font-semibold'
                  : 'text-[#5F635C] hover:text-[#242823] hover:bg-[#F3F1EB]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    isActive ? 'bg-[#FFFFFF]/20 text-white' : 'bg-[#F0EDE6] text-[#242823]'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* =====================================================================
          SECTION 1: VISÃO GERAL DO PLANEJAMENTO
         ===================================================================== */}
      {activeSection === 'overview' && budgetSummary && goalsSummary && cashFlow && (
        <div className="space-y-6">
          {/* Top 4 KPI Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
              <div className="text-[11px] font-semibold text-[#777A72] uppercase">
                Execução Orçamentária ({selectedMonth})
              </div>
              <div className="text-2xl font-serif font-bold text-[#242823] tabular-nums mt-1">
                {budgetSummary.globalExecutionPct}%
              </div>
              <div className="text-[11px] text-[#5F635C] mt-1 font-mono">
                {formatCurrency(budgetSummary.totalBudgetedRealizedSpent)} / {formatCurrency(budgetSummary.totalPlanned)}
              </div>
            </div>

            <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
              <div className="text-[11px] font-semibold text-[#777A72] uppercase">
                Reserva Real Verificada
              </div>
              <div className="text-2xl font-serif font-bold text-[#245A3C] tabular-nums mt-1">
                {formatCurrency(goalsSummary.verifiedAvailableReserve)}
              </div>
              <div className="text-[11px] text-[#5F635C] mt-1">
                Alocado em metas: {formatCurrency(goalsSummary.totalBackedByRealBalance)}
              </div>
            </div>

            <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
              <div className="text-[11px] font-semibold text-[#777A72] uppercase">
                Menor Liquidez Projetada ({cashFlow.horizonMonths}m)
              </div>
              <div
                className={`text-2xl font-serif font-bold tabular-nums mt-1 ${
                  cashFlow.lowestProjectedBalance < 0
                    ? 'text-[#963F36]'
                    : cashFlow.lowestProjectedBalance < (planningData.preferences?.minLiquidityThreshold || 1000)
                    ? 'text-[#795C24]'
                    : 'text-[#242823]'
                }`}
              >
                {formatCurrency(cashFlow.lowestProjectedBalance)}
              </div>
              <div className="text-[11px] text-[#5F635C] mt-1">
                Mês de referência: <span className="font-mono">{cashFlow.lowestProjectedMonth}</span>
              </div>
            </div>

            <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
              <div className="text-[11px] font-semibold text-[#777A72] uppercase">
                Alertas Preventivos Ativos
              </div>
              <div
                className={`text-2xl font-serif font-bold tabular-nums mt-1 ${
                  activeAlerts.some((a) => a.severity === 'CRITICAL')
                    ? 'text-[#963F36]'
                    : activeAlerts.length > 0
                    ? 'text-[#795C24]'
                    : 'text-[#245A3C]'
                }`}
              >
                {activeAlerts.length}
              </div>
              <div className="text-[11px] text-[#5F635C] mt-1">
                {activeAlerts.length === 0
                  ? 'Dentro dos parâmetros configurados'
                  : 'Requerem atenção preventiva'}
              </div>
            </div>
          </div>

          {/* Two-Column Executive Overview: Active Alerts + Quick Cash Flow & Goals */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Active Alerts & Budget Highlights (7 cols) */}
            <div className="lg:col-span-7 p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2.5 border-b border-[#E7E1D7]">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[#795C24]" />
                  <h3 className="font-serif text-base font-bold text-[#242823]">
                    Alertas de Liquidez, Orçamentos e Compromissos
                  </h3>
                </div>
                <button
                  onClick={() => setActiveSection('alerts')}
                  className="text-xs font-medium text-[#253A32] hover:underline cursor-pointer"
                >
                  Gerenciar limites →
                </button>
              </div>

              {activeAlerts.length === 0 ? (
                <div className="p-6 text-center rounded-md bg-[#F6F3ED] border border-[#E7E1D7] text-xs text-[#5F635C]">
                  Nenhum alerta preventivo ativo para o período {selectedMonth}.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {activeAlerts.slice(0, 5).map((alert) => {
                    const isCrit = alert.severity === 'CRITICAL';
                    return (
                      <div
                        key={alert.id}
                        className={`p-3.5 rounded-md border text-xs flex items-start justify-between gap-3 ${
                          isCrit
                            ? 'bg-[#F8E8E5] border-[#EED0CC] text-[#963F36]'
                            : 'bg-[#F5EEDB] border-[#E8DEC7] text-[#795C24]'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="font-bold flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>{alert.title}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/70 border border-current/20">
                              {alert.period}
                            </span>
                          </div>
                          <p className="text-[#242823] leading-relaxed">{alert.reason}</p>
                        </div>
                        <button
                          onClick={() => handleToggleAlertStatus(alert.fingerprint, alert.status)}
                          className="px-2 py-1 rounded bg-white/80 hover:bg-white text-[11px] font-medium text-[#5F635C] border border-[#E7E1D7] shrink-0 cursor-pointer"
                        >
                          Dispensar
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Goals & Cash Flow Snapshot (5 cols) */}
            <div className="lg:col-span-5 p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2.5 border-b border-[#E7E1D7]">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-[#245A3C]" />
                  <h3 className="font-serif text-base font-bold text-[#242823]">
                    Resumo de Metas & Alocação Real
                  </h3>
                </div>
                <button
                  onClick={() => setActiveSection('goals')}
                  className="text-xs font-medium text-[#253A32] hover:underline cursor-pointer"
                >
                  Configurar metas →
                </button>
              </div>

              <div className="p-3.5 rounded-md bg-[#F6F3ED] border border-[#E7E1D7] space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#5F635C]">Saldo Líquido + Investido Real:</span>
                  <span className="font-mono font-bold text-[#242823]">
                    {formatCurrency(goalsSummary.verifiedAvailableReserve)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5F635C]">Acumulado Declarado em Metas:</span>
                  <span className="font-mono font-semibold text-[#242823]">
                    {formatCurrency(goalsSummary.totalDeclaredCurrentAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5F635C]">Lastreado por Saldo Real Exclusivo:</span>
                  <span className="font-mono font-bold text-[#245A3C]">
                    {formatCurrency(goalsSummary.totalBackedByRealBalance)}
                  </span>
                </div>
                {goalsSummary.isReserveOverAllocated && (
                  <div className="pt-1.5 border-t border-[#E7E1D7] text-[11px] text-[#963F36] font-medium">
                    Atenção: R$ {goalsSummary.totalUnbackedGoalAmount.toFixed(2)} declarados em metas excedem o saldo disponível sem dupla contagem.
                  </div>
                )}
              </div>

              {goalsSummary.goals.length === 0 ? (
                <div className="p-5 text-center rounded-md border border-dashed border-[#D6CFC2] text-xs text-[#777A72]">
                  Nenhuma meta financeira cadastrada ainda. Crie sua primeira meta na aba &quot;Metas Financeiras&quot;.
                </div>
              ) : (
                <div className="space-y-2">
                  {goalsSummary.goals.slice(0, 3).map((g: any) => (
                    <div
                      key={g.id}
                      className="p-3 rounded-md border border-[#E7E1D7] bg-[#FFFFFF] space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#242823]">{g.title}</span>
                        <span className="font-mono text-[11px] font-bold text-[#245A3C]">
                          {g.progressPct}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-[#F0EDE6] overflow-hidden">
                        <div
                          className="h-1.5 rounded-full bg-[#245A3C]"
                          style={{ width: `${Math.min(100, g.progressPct)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-[#777A72] font-mono">
                        <span>
                          {formatCurrency(g.declaredCurrentAmount)} / {formatCurrency(g.targetAmount)}
                        </span>
                        <span>Aporte/mês: {formatCurrency(g.plannedMonthlyContribution)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 2: ORÇAMENTOS POR CATEGORIA
         ===================================================================== */}
      {activeSection === 'budgets' && budgetSummary && (
        <div className="space-y-6">
          {/* Period Movement Status Notice */}
          {!budgetSummary.hasMovementsInPeriod && (
            <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] flex items-center gap-3 text-xs text-[#5F635C]">
              <Info className="w-4 h-4 text-[#253A32] shrink-0" />
              <div>
                <span className="font-semibold text-[#242823]">
                  Período sem movimentações realizadas ({selectedMonth}):{' '}
                </span>
                <span>
                  Não há despesas ou receitas liquidadas registradas neste mês. Os valores planejados permanecem disponíveis para planejamento, sem confundir estimativas com gastos realizados.
                </span>
              </div>
            </div>
          )}

          {/* Top 4 Budget Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
              <div className="text-[11px] font-semibold text-[#777A72] uppercase">
                Total Planejado (Ativos)
              </div>
              <div className="text-2xl font-serif font-bold text-[#242823] tabular-nums mt-1">
                {formatCurrency(budgetSummary.totalPlanned)}
              </div>
              <div className="text-[11px] text-[#5F635C] mt-1">
                {budgetSummary.activeBudgetsCount} categorias com teto ativo
              </div>
            </div>

            <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
              <div className="text-[11px] font-semibold text-[#777A72] uppercase">
                Gasto Efetivamente Realizado
              </div>
              <div className="text-2xl font-serif font-bold text-[#963F36] tabular-nums mt-1">
                {formatCurrency(budgetSummary.totalRealizedExpenses)}
              </div>
              <div className="text-[11px] text-[#5F635C] mt-1">
                Exclui transferências próprias e ignoradas
              </div>
            </div>

            <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
              <div className="text-[11px] font-semibold text-[#777A72] uppercase">
                Saldo Orçamentário Restante
              </div>
              <div
                className={`text-2xl font-serif font-bold tabular-nums mt-1 ${
                  budgetSummary.totalRemainingBalance >= 0 ? 'text-[#245A3C]' : 'text-[#963F36]'
                }`}
              >
                {formatCurrency(budgetSummary.totalRemainingBalance)}
              </div>
              <div className="text-[11px] text-[#5F635C] mt-1">
                Execução global: <span className="font-mono font-bold">{budgetSummary.globalExecutionPct}%</span>
              </div>
            </div>

            <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
              <div className="text-[11px] font-semibold text-[#777A72] uppercase">
                Gasto Sem Orçamento Definido
              </div>
              <div className="text-2xl font-serif font-bold text-[#795C24] tabular-nums mt-1">
                {formatCurrency(budgetSummary.totalUnbudgetedSpent)}
              </div>
              <div className="text-[11px] text-[#5F635C] mt-1">
                {budgetSummary.unbudgetedWithSpendCount} categoria(s) sem teto
              </div>
            </div>
          </div>

          {/* Structured Category Budgets Table */}
          <div className="rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E7E1D7] bg-[#F6F3ED] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-bold text-[#242823]">
                  Orçamentos por Categoria — Vigência {selectedMonth}
                </span>
                <span className="text-[#777A72] ml-2">
                  (Gasto realizado contempla compras em conta e cartão sem duplicar pagamento de fatura)
                </span>
              </div>
              <span className="font-mono text-[11px] text-[#5F635C]">
                Alerta: {budgetSummary.warningThresholdPct}% | Limite: {budgetSummary.criticalThresholdPct}%
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-[#E7E1D7] bg-[#FAF8F5] text-[#777A72] text-[11px] font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-4">Categoria / Orçamento</th>
                    <th className="py-2.5 px-3">Estado</th>
                    <th className="py-2.5 px-4 text-right">Planejado</th>
                    <th className="py-2.5 px-4 text-right">Gasto Realizado</th>
                    <th className="py-2.5 px-4 text-right">Saldo Restante</th>
                    <th className="py-2.5 px-4 w-48">Execução & Indicador</th>
                    <th className="py-2.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E1D7]">
                  {budgetSummary.items.map((item: any) => {
                    const isEditing = editingCategoryId === item.categoryId;
                    const isShowingHistory = historyCategoryId === item.categoryId;

                    const badgeMap: Record<string, { label: string; cls: string }> = {
                      WITHIN_LIMIT: { label: 'Dentro do Limite', cls: 'bg-[#E4EFE6] text-[#245A3C] border-[#D1E2D4]' },
                      NEAR_LIMIT: { label: 'Próximo do Limite', cls: 'bg-[#F5EEDB] text-[#795C24] border-[#E8DEC7]' },
                      OVER_BUDGET: { label: 'Limite Ultrapassado', cls: 'bg-[#F8E8E5] text-[#963F36] border-[#EED0CC]' },
                      UNBUDGETED: { label: 'Sem Orçamento', cls: 'bg-[#F5EEDB] text-[#795C24] border-[#E8DEC7]' },
                      CLOSED: { label: 'Encerrado', cls: 'bg-[#F0EDE6] text-[#777A72] border-[#E7E1D7]' },
                      NO_ACTIVITY: { label: 'Sem Movimentação', cls: 'bg-[#F0EDE6] text-[#777A72] border-[#E7E1D7]' },
                    };
                    const badge = badgeMap[item.indicator] || badgeMap.NO_ACTIVITY;

                    return (
                      <React.Fragment key={item.categoryId}>
                        <tr className="hover:bg-[#F3F1EB] transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: item.color || '#253A32' }}
                              />
                              <div>
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editBudgetName}
                                    onChange={(e) => setEditBudgetName(e.target.value)}
                                    placeholder="Nome do orçamento"
                                    className="px-2 py-0.5 rounded border border-[#253A32] bg-white text-xs text-[#242823]"
                                  />
                                ) : (
                                  <div className="font-semibold text-[#242823]">{item.budgetName}</div>
                                )}
                                <div className="text-[11px] text-[#777A72]">
                                  {item.categoryGroup === 'FIXED'
                                    ? 'Necessidade Fixa'
                                    : item.categoryGroup === 'INVESTMENT'
                                    ? 'Aporte Patrimonial'
                                    : 'Despesa Variável'}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                                item.status === 'ACTIVE'
                                  ? 'bg-[#E4EFE6] text-[#245A3C] border-[#D1E2D4]'
                                  : 'bg-[#F0EDE6] text-[#777A72] border-[#E7E1D7]'
                              }`}
                            >
                              {item.status === 'ACTIVE' ? 'ATIVO' : 'ENCERRADO'}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            {isEditing ? (
                              <div className="flex flex-col items-end gap-1">
                                <input
                                  type="number"
                                  step="any"
                                  value={editBudgetAmount}
                                  onChange={(e) => setEditBudgetAmount(e.target.value)}
                                  className="w-28 px-2 py-0.5 rounded border border-[#253A32] bg-white text-right font-mono text-xs"
                                  autoFocus
                                />
                                <input
                                  type="text"
                                  value={editBudgetNote}
                                  onChange={(e) => setEditBudgetNote(e.target.value)}
                                  placeholder="Motivo da alteração..."
                                  className="w-36 px-2 py-0.5 rounded border border-[#E7E1D7] bg-white text-[10px] font-sans"
                                />
                              </div>
                            ) : (
                              <span className="font-semibold text-[#242823]">
                                {formatCurrency(item.plannedAmount)}
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right font-mono font-bold text-[#242823] tabular-nums">
                            {formatCurrency(item.realizedSpent)}
                          </td>

                          <td
                            className={`py-3 px-4 text-right font-mono font-semibold tabular-nums ${
                              item.remainingBalance >= 0 ? 'text-[#245A3C]' : 'text-[#963F36]'
                            }`}
                          >
                            {formatCurrency(item.remainingBalance)}
                          </td>

                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className={`px-1.5 py-0.2 rounded border text-[10px] font-semibold ${badge.cls}`}>
                                  {badge.label}
                                </span>
                                <span className="font-mono font-bold text-[#242823]">
                                  {item.executionPct}%
                                </span>
                              </div>
                              <div className="w-full bg-[#F0EDE6] rounded-full h-1.5 overflow-hidden border border-[#E7E1D7]">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    item.isOverBudget
                                      ? 'bg-[#963F36]'
                                      : item.isNearLimit || item.isUnbudgeted
                                      ? 'bg-[#795C24]'
                                      : 'bg-[#245A3C]'
                                  }`}
                                  style={{ width: `${Math.min(100, item.executionPct)}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-right">
                            {item.categoryId === '__uncategorized__' ? (
                              <span className="text-[11px] text-[#777A72]">Sem categoria</span>
                            ) : isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleSaveBudget(item.categoryId)}
                                  disabled={isSavingBudget}
                                  className="px-2.5 py-1 rounded bg-[#253A32] text-white text-xs font-medium cursor-pointer"
                                >
                                  Salvar
                                </button>
                                <button
                                  onClick={() => setEditingCategoryId(null)}
                                  className="px-2 py-1 rounded border border-[#E7E1D7] text-[#5F635C] text-xs cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleStartEditBudget(item)}
                                  title="Editar valor planejado ou nome"
                                  className="px-2 py-1 rounded border border-[#E7E1D7] hover:bg-[#F0EDE6] text-[#242823] text-xs font-medium cursor-pointer"
                                >
                                  Ajustar
                                </button>
                                <button
                                  onClick={() =>
                                    handleSaveBudget(
                                      item.categoryId,
                                      item.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE',
                                      item.plannedAmount
                                    )
                                  }
                                  title={item.status === 'ACTIVE' ? 'Encerrar orçamento no período' : 'Reativar orçamento'}
                                  className="p-1.5 rounded border border-[#E7E1D7] hover:bg-[#F0EDE6] text-[#5F635C] cursor-pointer"
                                >
                                  {item.status === 'ACTIVE' ? (
                                    <Lock className="w-3.5 h-3.5" />
                                  ) : (
                                    <Unlock className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={() =>
                                    setHistoryCategoryId(
                                      isShowingHistory ? null : item.categoryId
                                    )
                                  }
                                  title="Histórico de alterações"
                                  className="p-1.5 rounded border border-[#E7E1D7] hover:bg-[#F0EDE6] text-[#5F635C] cursor-pointer"
                                >
                                  <History className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>

                        {/* Audit History Expandable Row */}
                        {isShowingHistory && (
                          <tr className="bg-[#FAF8F5]">
                            <td colSpan={7} className="px-6 py-3 text-xs">
                              <div className="font-semibold text-[#242823] mb-1.5 flex items-center gap-1.5">
                                <History className="w-3.5 h-3.5 text-[#253A32]" />
                                <span>Histórico de Alterações — {item.budgetName} ({selectedMonth})</span>
                              </div>
                              {!item.history || item.history.length === 0 ? (
                                <div className="text-[11px] text-[#777A72]">
                                  Nenhuma alteração manual registrada neste período (utilizando teto padrão da categoria).
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  {item.history.map((h: any, idx: number) => (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between text-[11px] py-1 border-b border-[#E7E1D7]/60 font-mono"
                                    >
                                      <span>
                                        {new Date(h.timestamp).toLocaleString('pt-BR')} — De{' '}
                                        {formatCurrency(h.previousAmount)} para{' '}
                                        <strong>{formatCurrency(h.newAmount)}</strong> ({h.newStatus || 'ACTIVE'})
                                      </span>
                                      <span className="font-sans text-[#5F635C]">{h.note || ''}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 3: METAS FINANCEIRAS PESSOAIS
         ===================================================================== */}
      {activeSection === 'goals' && goalsSummary && (
        <div className="space-y-6">
          {/* Reserve Backing Banner */}
          <div className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#777A72]">
                Regra Explícita de Alocação de Liquidez (Prevenção de Dupla Contagem)
              </div>
              <div className="text-sm font-semibold text-[#242823]">
                Disponibilidade Verificada em Contas: {formatCurrency(goalsSummary.verifiedAvailableReserve)} •{' '}
                Lastreado nas Metas: {formatCurrency(goalsSummary.totalBackedByRealBalance)} •{' '}
                Livre Não Alocado: {formatCurrency(goalsSummary.unallocatedAvailableReserve)}
              </div>
              <p className="text-xs text-[#5F635C]">
                O motor aloca o saldo real disponível por ordem de prioridade sem contar o mesmo dinheiro simultaneamente em duas metas. A edição ou exclusão de metas não modifica saldos ou transações bancárias.
              </p>
            </div>
            <button
              onClick={() => {
                resetGoalForm();
                setIsGoalFormOpen(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#253A32] hover:bg-[#1B2B25] text-white text-xs font-medium shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Meta Financeira</span>
            </button>
          </div>

          {/* Goal Creation / Edition Form */}
          {isGoalFormOpen && (
            <form
              onSubmit={handleSaveGoal}
              className="p-5 rounded-lg border border-[#253A32] bg-[#FFFFFF] shadow-sm space-y-4 text-xs"
            >
              <div className="flex items-center justify-between border-b border-[#E7E1D7] pb-2">
                <h3 className="font-serif text-base font-bold text-[#242823]">
                  {editingGoalId ? 'Editar Meta Financeira' : 'Configurar Nova Meta Financeira'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsGoalFormOpen(false)}
                  className="text-[#777A72] hover:text-[#242823]"
                >
                  Fechar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                    Nome da Meta *
                  </label>
                  <input
                    type="text"
                    required
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    placeholder="Ex: Reserva de Emergência 6m"
                    className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] text-[#242823]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                    Finalidade / Objetivo
                  </label>
                  <input
                    type="text"
                    value={goalPurpose}
                    onChange={(e) => setGoalPurpose(e.target.value)}
                    placeholder="Ex: Proteção contra imprevistos"
                    className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] text-[#242823]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                    Valor-Alvo (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    placeholder="15000.00"
                    className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono text-[#242823]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                    Valor Já Acumulado (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={goalCurrent}
                    onChange={(e) => setGoalCurrent(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono text-[#242823]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                    Contribuição Mensal Planejada (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={goalMonthlyContrib}
                    onChange={(e) => setGoalMonthlyContrib(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono text-[#242823]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                    Data-Alvo Opcional (YYYY-MM)
                  </label>
                  <input
                    type="month"
                    value={goalDeadline ? goalDeadline.slice(0, 7) : ''}
                    onChange={(e) => setGoalDeadline(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono text-[#242823]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                    Prioridade de Alocação (1 = Maior)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={goalPriority}
                    onChange={(e) => setGoalPriority(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono text-[#242823]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                    Estado da Meta
                  </label>
                  <select
                    value={goalStatus}
                    onChange={(e) => setGoalStatus(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] text-[#242823]"
                  >
                    <option value="ACTIVE">Ativa</option>
                    <option value="PAUSED">Pausada</option>
                    <option value="COMPLETED">Concluída</option>
                    <option value="CANCELLED">Cancelada</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsGoalFormOpen(false)}
                  className="px-3 py-1.5 rounded border border-[#E7E1D7] text-[#5F635C]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingGoal}
                  className="px-4 py-1.5 rounded bg-[#253A32] text-white font-medium cursor-pointer"
                >
                  {isSavingGoal ? 'Salvando...' : 'Salvar Meta'}
                </button>
              </div>
            </form>
          )}

          {/* Goals List */}
          {goalsSummary.goals.length === 0 ? (
            <div className="p-10 text-center rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] text-xs text-[#777A72]">
              Nenhuma meta financeira configurada. Clique em &quot;Nova Meta Financeira&quot; para definir objetivos de poupança com cálculo determinístico de aportes.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {goalsSummary.goals.map((g: any) => {
                const statusBadgeMap: Record<string, { label: string; cls: string }> = {
                  ON_TRACK: { label: 'No Ritmo para a Data-Alvo', cls: 'bg-[#E4EFE6] text-[#245A3C] border-[#D1E2D4]' },
                  AT_RISK: { label: 'Aporte Insuficiente p/ Prazo', cls: 'bg-[#F5EEDB] text-[#795C24] border-[#E8DEC7]' },
                  OVERDUE: { label: 'Prazo-Alvo Vencido', cls: 'bg-[#F8E8E5] text-[#963F36] border-[#EED0CC]' },
                  COMPLETED: { label: 'Meta Concluída', cls: 'bg-[#E4EFE6] text-[#245A3C] border-[#D1E2D4]' },
                  NO_DEADLINE: { label: 'Sem Prazo Fixo', cls: 'bg-[#F0EDE6] text-[#5F635C] border-[#E7E1D7]' },
                  PAUSED: { label: 'Pausada', cls: 'bg-[#F0EDE6] text-[#777A72] border-[#E7E1D7]' },
                  CANCELLED: { label: 'Cancelada', cls: 'bg-[#F0EDE6] text-[#777A72] border-[#E7E1D7]' },
                };
                const badge = statusBadgeMap[g.feasibility] || statusBadgeMap.NO_DEADLINE;

                return (
                  <div
                    key={g.id}
                    className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col justify-between space-y-4 text-xs"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F0EDE6] text-[#5F635C]">
                              Prioridade #{g.priority}
                            </span>
                            <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </div>
                          <h4 className="font-serif text-lg font-bold text-[#242823] mt-1">
                            {g.title}
                          </h4>
                          {g.purpose && (
                            <p className="text-[11px] text-[#5F635C]">{g.purpose}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEditGoal(g)}
                            className="p-1.5 rounded border border-[#E7E1D7] hover:bg-[#F0EDE6] text-[#5F635C] cursor-pointer"
                            title="Editar meta"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteGoal(g.id)}
                            className="p-1.5 rounded border border-[#E7E1D7] hover:bg-[#F8E8E5] text-[#963F36] cursor-pointer"
                            title="Excluir meta"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between font-mono text-xs">
                          <span className="text-[#5F635C]">
                            Acumulado: <strong className="text-[#242823]">{formatCurrency(g.declaredCurrentAmount)}</strong>
                          </span>
                          <span className="font-bold text-[#245A3C]">{g.progressPct}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[#F0EDE6] overflow-hidden border border-[#E7E1D7]">
                          <div
                            className="h-2 rounded-full bg-[#245A3C]"
                            style={{ width: `${Math.min(100, g.progressPct)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[11px] text-[#777A72] font-mono">
                          <span>Lastro Real Exclusivo: {formatCurrency(g.backedByRealBalance)}</span>
                          <span>Alvo: {formatCurrency(g.targetAmount)}</span>
                        </div>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-2 gap-2.5 p-3 rounded-md bg-[#F6F3ED] border border-[#E7E1D7] font-mono text-[11px]">
                        <div>
                          <div className="text-[#777A72] font-sans">Falta Acumular</div>
                          <div className="font-bold text-[#242823]">{formatCurrency(g.remainingAmount)}</div>
                        </div>
                        <div>
                          <div className="text-[#777A72] font-sans">Aporte Mensal Planejado</div>
                          <div className="font-bold text-[#242823]">{formatCurrency(g.plannedMonthlyContribution)}</div>
                        </div>
                        <div>
                          <div className="text-[#777A72] font-sans">Aporte Necessário p/ Prazo</div>
                          <div className="font-bold text-[#242823]">
                            {g.requiredMonthlyContribution !== null
                              ? `${formatCurrency(g.requiredMonthlyContribution)} (${g.monthsRemaining}m)`
                              : 'Sem data-alvo'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[#777A72] font-sans">Conclusão Projetada</div>
                          <div className="font-bold text-[#242823]">
                            {g.estimatedCompletionMonth
                              ? `${g.estimatedCompletionMonth} (${g.estimatedMonthsToComplete}m)`
                              : 'Defina aporte > 0'}
                          </div>
                        </div>
                      </div>

                      {g.unbackedAmount > 0 && (
                        <div className="p-2 rounded bg-[#F5EEDB] border border-[#E8DEC7] text-[11px] text-[#795C24]">
                          Nota: {formatCurrency(g.unbackedAmount)} do valor acumulado declarado excede o saldo disponível após metas de maior prioridade.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SECTION 4: FLUXO DE CAIXA PROJETADO
         ===================================================================== */}
      {activeSection === 'cashflow' && cashFlow && (
        <div className="space-y-6">
          {/* Horizon Controls & New Recurring Commitment Button */}
          <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-[#242823]">Horizonte de Projeção:</span>
              {[3, 6, 12].map((h) => (
                <button
                  key={h}
                  onClick={() => setHorizonMonths(h)}
                  className={`px-3 py-1 rounded border font-mono cursor-pointer ${
                    horizonMonths === h
                      ? 'bg-[#253A32] text-white border-[#253A32] font-bold'
                      : 'bg-[#F6F3ED] text-[#5F635C] border-[#E7E1D7]'
                  }`}
                >
                  {h} meses
                </button>
              ))}
              <span className="text-[#777A72] ml-2">
                Saldo Inicial Líquido Verificado: <strong className="font-mono text-[#242823]">{formatCurrency(cashFlow.initialLiquidBalance)}</strong>
              </span>
            </div>

            <button
              onClick={() => setIsRecurringFormOpen(!isRecurringFormOpen)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#253A32] text-white font-medium cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Receita/Despesa Recorrente</span>
            </button>
          </div>

          {/* Sprint 7: 30 / 60 / 90 Days Horizon Projections */}
          {cashFlow.horizonSummaries && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { key: 'days30', title: 'Horizonte 30 Dias', data: cashFlow.horizonSummaries.days30 },
                { key: 'days60', title: 'Horizonte 60 Dias', data: cashFlow.horizonSummaries.days60 },
                { key: 'days90', title: 'Horizonte 90 Dias', data: cashFlow.horizonSummaries.days90 },
              ].map(({ key, title, data }) => (
                <div key={key} className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#777A72] uppercase">
                    <span>{title}</span>
                    <span className="font-mono text-[10px] text-[#5F635C]">Até {data.targetDate}</span>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#5F635C]">Saldo Fechamento Projetado</div>
                    <div className={`text-2xl font-serif font-bold tabular-nums ${data.projectedClosingBalance < 0 ? 'text-[#963F36]' : 'text-[#245A3C]'}`}>
                      {formatCurrency(data.projectedClosingBalance)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#F0EDE6] text-[11px] font-mono">
                    <div>
                      <span className="text-[#777A72]">Entradas: </span>
                      <span className="text-[#245A3C] font-semibold">+{formatCurrency(data.projectedInflows)}</span>
                    </div>
                    <div>
                      <span className="text-[#777A72]">Saídas: </span>
                      <span className="text-[#963F36] font-semibold">-{formatCurrency(data.projectedOutflows)}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-[#777A72] pt-1 flex items-center justify-between">
                    <span>Menor saldo: <strong className="font-mono text-[#242823]">{formatCurrency(data.lowestProjectedBalance)}</strong></span>
                    {data.isNegativeLiquidity && (
                      <span className="text-[#963F36] font-semibold">Alerta Liquidez</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sprint 7: 8 Prospective Cash Flow Indicators */}
          {cashFlow.indicators && (
            <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#F6F3ED] shadow-xs grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-center">
              <div>
                <div className="text-[10px] uppercase font-semibold text-[#777A72]">Receita Realizada</div>
                <div className="text-sm font-bold font-mono text-[#245A3C] mt-0.5">{formatCurrency(cashFlow.indicators.realizedIncomePeriod)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-semibold text-[#777A72]">Receita Prevista</div>
                <div className="text-sm font-bold font-mono text-[#242823] mt-0.5">{formatCurrency(cashFlow.indicators.expectedIncomePeriod)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-semibold text-[#777A72]">Variação Real vs Prev</div>
                <div className={`text-sm font-bold font-mono mt-0.5 ${cashFlow.indicators.varianceExpectationVsRealized >= 0 ? 'text-[#245A3C]' : 'text-[#963F36]'}`}>
                  {cashFlow.indicators.varianceExpectationVsRealized >= 0 ? '+' : ''}{formatCurrency(cashFlow.indicators.varianceExpectationVsRealized)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-semibold text-[#777A72]">Renda Recorrente</div>
                <div className="text-sm font-bold font-mono text-[#242823] mt-0.5">{formatCurrency(cashFlow.indicators.activeRecurringIncome)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-semibold text-[#777A72]">Receitas Vencidas</div>
                <div className={`text-sm font-bold font-mono mt-0.5 ${cashFlow.indicators.overdueUnreconciledIncome > 0 ? 'text-[#963F36]' : 'text-[#777A72]'}`}>
                  {formatCurrency(cashFlow.indicators.overdueUnreconciledIncome)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-semibold text-[#777A72]">Despesas Previstas</div>
                <div className="text-sm font-bold font-mono text-[#963F36] mt-0.5">{formatCurrency(cashFlow.indicators.expectedExpensesPeriod)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-semibold text-[#777A72]">Comprometimento</div>
                <div className="text-sm font-bold font-mono text-[#242823] mt-0.5">{cashFlow.indicators.futureCommitmentRatePct}%</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-semibold text-[#777A72]">Saldo Projetado Mês</div>
                <div className="text-sm font-bold font-mono text-[#245A3C] mt-0.5">{formatCurrency(cashFlow.indicators.projectedClosingBalance)}</div>
              </div>
            </div>
          )}

          {/* Recurring Flow Creation Form */}
          {renderRecurringForm()}

          {/* Chart: Projected Balance Trajectory (Confirmado vs Projetado Total) */}
          <div className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-serif text-base font-bold text-[#242823]">
                  Trajetória de Liquidez: Realizado vs. Confirmado vs. Estimado
                </h3>
                <p className="text-xs text-[#5F635C]">
                  Mês 0 ({selectedMonth}) exibe a movimentação realizada; meses subsequentes aplicam compromissos programados e hipóteses estimadas.
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="px-2 py-0.5 rounded bg-[#E4EFE6] text-[#245A3C]">Confirmado</span>
                <span className="px-2 py-0.5 rounded bg-[#F5EEDB] text-[#795C24]">Estimado (Hipótese)</span>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={cashFlow.months}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E1D7" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#5F635C' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#5F635C' }} />
                  <Tooltip
                    formatter={(value: any) => formatCurrency(Number(value))}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E7E1D7',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="realized.net"
                    name="Saldo Líquido Realizado (Mês Atual)"
                    fill="#2A4365"
                  />
                  <Bar
                    dataKey="confirmed.net"
                    name="Resultado Líquido Confirmado/Programado"
                    fill="#245A3C"
                  />
                  <Bar
                    dataKey="estimated.net"
                    name="Resultado Líquido Estimado (Hipótese)"
                    fill="#B29A70"
                  />
                  <Line
                    type="monotone"
                    dataKey="closingConfirmedBalance"
                    name="Caixa Final Confirmado"
                    stroke="#245A3C"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="closingTotalProjectedBalance"
                    name="Caixa Final Projetado (c/ Estimados)"
                    stroke="#795C24"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3-Bucket Projection Table */}
          <div className="rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E7E1D7] bg-[#F6F3ED] flex items-center justify-between text-xs">
              <span className="font-bold text-[#242823]">
                Demonstrativo Mensal Separado por Natureza (Realizado • Confirmado • Estimado)
              </span>
              <span className="font-mono text-[11px] text-[#5F635C]">
                Horizonte: {cashFlow.horizonMonths} meses
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans border-collapse min-w-[850px]">
                <thead>
                  <tr className="border-b border-[#E7E1D7] bg-[#FAF8F5] text-[#777A72] text-[11px] font-semibold uppercase">
                    <th className="py-2.5 px-3">Mês</th>
                    <th className="py-2.5 px-3 text-right">Saldo Inicial</th>
                    <th className="py-2.5 px-3 text-right">1. Realizado (Líq.)</th>
                    <th className="py-2.5 px-3 text-right">2. Confirmado (+)</th>
                    <th className="py-2.5 px-3 text-right">2. Confirmado (-)</th>
                    <th className="py-2.5 px-3 text-right">3. Estimado (Líq.)</th>
                    <th className="py-2.5 px-3 text-right">Caixa Confirmado</th>
                    <th className="py-2.5 px-3 text-right">Caixa Projetado Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E1D7] font-mono">
                  {cashFlow.months.map((m: any) => (
                    <tr key={m.month} className="hover:bg-[#F3F1EB]">
                      <td className="py-2.5 px-3 font-bold text-[#242823]">
                        {m.month}{' '}
                        {m.monthIndex === 0 && (
                          <span className="text-[10px] font-sans font-normal px-1.5 py-0.2 rounded bg-[#F0EDE6] text-[#5F635C]">
                            Atual
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#5F635C]">
                        {formatCurrency(m.openingLiquidBalance)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {m.monthIndex === 0 ? (
                          <span className={m.realized.net >= 0 ? 'text-[#245A3C]' : 'text-[#963F36]'}>
                            {formatCurrency(m.realized.net)}
                          </span>
                        ) : (
                          <span className="text-[#777A72]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#245A3C]">
                        {m.confirmed.totalInflows > 0 ? `+${formatCurrency(m.confirmed.totalInflows)}` : 'R$ 0,00'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#963F36]">
                        {m.confirmed.totalOutflows > 0 ? `-${formatCurrency(m.confirmed.totalOutflows)}` : 'R$ 0,00'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#795C24]">
                        {m.estimated.net !== 0 ? formatCurrency(m.estimated.net) : 'R$ 0,00'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-[#242823]">
                        {formatCurrency(m.closingConfirmedBalance)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold ${
                          m.isNegativeLiquidity
                            ? 'text-[#963F36]'
                            : m.isLiquidityBelowThreshold
                            ? 'text-[#795C24]'
                            : 'text-[#245A3C]'
                        }`}
                      >
                        {formatCurrency(m.closingTotalProjectedBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Configured Recurring Commitments & Explicit Hypotheses */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Recurring Items List (7 cols) */}
            <div className="lg:col-span-7 p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] space-y-3 text-xs">
              <div className="font-serif text-base font-bold text-[#242823] pb-2 border-b border-[#E7E1D7]">
                Receitas e Despesas Recorrentes Configuradas pelo Usuário
              </div>
              {recurringList.length === 0 ? (
                <div className="p-6 text-center text-[#777A72] bg-[#F6F3ED] rounded border border-[#E7E1D7]">
                  Nenhuma receita ou despesa recorrente configurada manualmente. O motor não projeta receitas automaticamente apenas por encontrar transações passadas semelhantes.
                </div>
              ) : (
                <div className="divide-y divide-[#E7E1D7]">
                  {recurringList.map((rf: any) => (
                    <div key={rf.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#242823]">{rf.title}</span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                              rf.nature === 'CONFIRMED'
                                ? 'bg-[#E4EFE6] text-[#245A3C] border-[#D1E2D4]'
                                : 'bg-[#F5EEDB] text-[#795C24] border-[#E8DEC7]'
                            }`}
                          >
                            {rf.nature === 'CONFIRMED' ? 'CONFIRMADO' : 'ESTIMADO'}
                          </span>
                          {rf.remainingInstallments && (
                            <span className="text-[10px] font-mono text-[#777A72]">
                              ({rf.remainingInstallments} parc. restantes)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#777A72] font-mono">
                          Vigência: {rf.startMonth} {rf.endMonth ? `até ${rf.endMonth}` : '(Contínuo)'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono font-bold ${
                            rf.type === 'INCOME' ? 'text-[#245A3C]' : 'text-[#963F36]'
                          }`}
                        >
                          {rf.type === 'INCOME' ? '+' : '-'}
                          {formatCurrency(rf.amount)}
                        </span>
                        <button
                          onClick={() => handleEditRecurring(rf)}
                          className="p-1 rounded text-[#253A32] hover:bg-[#E4EFE6] cursor-pointer"
                          title="Editar compromisso"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleRecurring(rf.id, rf.isActive)}
                          className="px-2 py-0.5 rounded border border-[#E7E1D7] text-[10px] text-[#5F635C] cursor-pointer"
                        >
                          {rf.isActive === 1 ? 'Ativo' : 'Pausado'}
                        </button>
                        {rf.status !== 'ENDED' && (
                          <button
                            onClick={() => handleEndRecurring(rf.id)}
                            className="px-2 py-0.5 rounded border border-[#E7E1D7] text-[10px] text-[#777A72] hover:bg-[#F0EDE6] cursor-pointer"
                            title="Encerrar compromisso"
                          >
                            Encerrar
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteRecurring(rf.id)}
                          className="p-1 rounded text-[#963F36] hover:bg-[#F8E8E5] cursor-pointer"
                          title="Excluir compromisso"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Hypotheses & Historical Context Box (5 cols) */}
            <div className="lg:col-span-5 p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] space-y-3 text-xs">
              <div className="font-serif text-base font-bold text-[#242823] pb-2 border-b border-[#E7E1D7]">
                Hipóteses Explícitas & Referência Histórica
              </div>
              <div className="p-3 rounded bg-[#F6F3ED] border border-[#E7E1D7] space-y-1">
                <div className="font-semibold text-[#242823]">
                  Média Histórica ({cashFlow.historicalContext.analyzedMonths.length} meses observados)
                </div>
                <div className="flex justify-between font-mono text-[11px]">
                  <span>Receita Média Observada:</span>
                  <span className="text-[#245A3C]">{formatCurrency(cashFlow.historicalContext.averageMonthlyIncome)}</span>
                </div>
                <div className="flex justify-between font-mono text-[11px]">
                  <span>Despesa Média Observada:</span>
                  <span className="text-[#963F36]">{formatCurrency(cashFlow.historicalContext.averageMonthlyExpenses)}</span>
                </div>
                <p className="text-[11px] text-[#777A72] pt-1">
                  {cashFlow.historicalContext.note}
                </p>
              </div>

              <div className="space-y-2">
                {cashFlow.hypotheses.map((h: any) => (
                  <div key={h.code} className="p-2.5 rounded border border-[#E7E1D7] bg-[#FAF8F5]">
                    <div className="text-[10px] font-mono font-bold text-[#253A32]">{h.code}</div>
                    <p className="text-[11px] text-[#5F635C] mt-0.5">{h.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION: FONTES DE RENDA & RECORRÊNCIAS COM CONCILIAÇÃO
         ===================================================================== */}
      {activeSection === 'recurring' && (
        <div className="space-y-6">
          {/* Header & New Flow Button */}
          <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            <div>
              <h2 className="font-serif text-lg font-bold text-[#242823]">
                Fontes de Renda, Recorrências & Conciliação
              </h2>
              <p className="text-[#5F635C] mt-0.5">
                Controle de receitas previsíveis, compromissos periódicos e reconciliação com extrato bancário real.
              </p>
            </div>
            <button
              onClick={() => {
                if (isRecurringFormOpen) {
                  resetRecurringForm();
                } else {
                  resetRecurringForm();
                  setRecType('INCOME');
                  setIsRecurringFormOpen(true);
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#253A32] text-white font-medium cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Fluxo Recorrente</span>
            </button>
          </div>

          {/* Recurring Flow Creation / Edit Form */}
          {renderRecurringForm()}

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-1">
              <div className="text-[11px] font-semibold text-[#777A72] uppercase">Renda Recorrente Ativa</div>
              <div className="text-2xl font-serif font-bold text-[#245A3C] tabular-nums">
                {formatCurrency(
                  recurringList
                    .filter((r) => r.type === 'INCOME' && r.isActive)
                    .reduce((acc, r) => acc + (Number(r.amount) || 0), 0)
                )}
              </div>
              <div className="text-[11px] text-[#5F635C]">Base mensal estimada ativa</div>
            </div>

            <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-1">
              <div className="text-[11px] font-semibold text-[#777A72] uppercase">Despesas Recorrentes</div>
              <div className="text-2xl font-serif font-bold text-[#963F36] tabular-nums">
                {formatCurrency(
                  recurringList
                    .filter((r) => r.type === 'EXPENSE' && r.isActive)
                    .reduce((acc, r) => acc + (Number(r.amount) || 0), 0)
                )}
              </div>
              <div className="text-[11px] text-[#5F635C]">Compromissos fixos e periódicos</div>
            </div>

            <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-1">
              <div className="text-[11px] font-semibold text-[#777A72] uppercase">Receitas Vencidas</div>
              <div className={`text-2xl font-serif font-bold tabular-nums ${overdueOccurrencesCount > 0 ? 'text-[#963F36]' : 'text-[#242823]'}`}>
                {overdueOccurrencesCount} pendente{overdueOccurrencesCount === 1 ? '' : 's'}
              </div>
              <div className="text-[11px] text-[#5F635C]">
                {overdueOccurrencesCount > 0 ? 'Data prevista passou sem conciliação' : 'Nenhuma receita em atraso'}
              </div>
            </div>

            <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-1">
              <div className="text-[11px] font-semibold text-[#777A72] uppercase">Total de Fluxos Cadastrados</div>
              <div className="text-2xl font-serif font-bold text-[#242823] tabular-nums">
                {recurringList.length} fluxos
              </div>
              <div className="text-[11px] text-[#5F635C]">
                {recurringList.filter((r) => r.type === 'INCOME').length} receitas / {recurringList.filter((r) => r.type === 'EXPENSE').length} despesas
              </div>
            </div>
          </div>

          {/* Occurrences Timeline & Reconciliation Feed */}
          <div className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E7E1D7] pb-3">
              <div>
                <h3 className="font-serif text-base font-bold text-[#242823]">
                  Cronograma de Ocorrências & Conciliação Inteligente
                </h3>
                <p className="text-xs text-[#5F635C]">
                  Reconcilie parcelas e receitas previstas com movimentações do extrato bancário.
                </p>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {[
                  { key: 'ALL', label: 'Todas' },
                  { key: 'PENDING', label: 'Previstas' },
                  { key: 'OVERDUE', label: 'Vencidas' },
                  { key: 'RECONCILED', label: 'Conciliadas' },
                  { key: 'MANUALLY_CONFIRMED', label: 'Confirmadas Manual' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setOccFilter(key as any)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer border ${
                      occFilter === key
                        ? 'bg-[#253A32] text-white border-[#253A32] font-semibold'
                        : 'bg-[#F6F3ED] text-[#5F635C] border-[#E7E1D7]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Occurrences List */}
            {occurrencesList.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#777A72]">
                Nenhuma ocorrência gerada ainda. Crie um fluxo recorrente acima para acompanhar parcelas e vencimentos.
              </div>
            ) : (
              <div className="space-y-3">
                {occurrencesList
                  .filter((occ) => occFilter === 'ALL' || occ.status === occFilter)
                  .map((occ) => {
                    const isIncome = occ.flowType === 'INCOME';
                    const isOverdue = occ.status === 'OVERDUE';
                    const isReconciled = occ.status === 'RECONCILED';
                    const isManuallyConfirmed = occ.status === 'MANUALLY_CONFIRMED';

                    let badgeCls = 'bg-[#F0EDE6] text-[#5F635C] border-[#E7E1D7]';
                    let badgeLabel = 'Prevista';

                    if (isOverdue) {
                      badgeCls = 'bg-[#F8E8E5] text-[#963F36] border-[#EED0CC]';
                      badgeLabel = 'Vencida sem Crédito';
                    } else if (isReconciled) {
                      badgeCls = 'bg-[#E4EFE6] text-[#245A3C] border-[#D1E2D4]';
                      badgeLabel = 'Conciliada com Extrato';
                    } else if (isManuallyConfirmed) {
                      badgeCls = 'bg-[#EAF0F6] text-[#205493] border-[#D0E2F2]';
                      badgeLabel = 'Confirmada Manualmente';
                    }

                    return (
                      <div
                        key={occ.id}
                        className={`p-4 rounded-lg border transition-colors ${
                          isOverdue
                            ? 'border-[#EED0CC] bg-[#FFFBFB]'
                            : isReconciled
                            ? 'border-[#D1E2D4] bg-[#FBFDFB]'
                            : 'border-[#E7E1D7] bg-[#FFFFFF]'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-[#242823]">
                                {occ.expectedDate}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${badgeCls}`}>
                                {badgeLabel}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#F6F3ED] text-[#777A72]">
                                {occ.frequency || 'MONTHLY'} • {occ.amountType || 'FIXED'}
                              </span>
                            </div>

                            <div className="font-serif text-base font-bold text-[#242823]">
                              {occ.flowTitle}
                            </div>
                          </div>

                          <div className="text-right flex sm:flex-col items-center sm:items-end justify-between sm:justify-center">
                            <div className="text-xs text-[#777A72]">Valor Esperado</div>
                            <div className={`text-lg font-serif font-bold tabular-nums ${isIncome ? 'text-[#245A3C]' : 'text-[#963F36]'}`}>
                              {isIncome ? '+' : '-'}{formatCurrency(occ.expectedAmount)}
                            </div>
                          </div>
                        </div>

                        {/* Reconciled Information */}
                        {isReconciled && occ.reconciledAmount && (
                          <div className="mt-3 p-2.5 rounded bg-[#E4EFE6]/50 border border-[#D1E2D4] flex items-center justify-between text-xs font-sans">
                            <div className="flex items-center gap-2 text-[#245A3C]">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span>
                                Conciliado com sucesso • Valor: <strong>{formatCurrency(occ.reconciledAmount)}</strong>
                                {occ.reconciledAt && ` em ${occ.reconciledAt.slice(0, 10)}`}
                              </span>
                            </div>
                            <button
                              onClick={() => handleUnreconcile(occ.id)}
                              disabled={isReconciling}
                              className="px-2.5 py-1 rounded border border-[#D1E2D4] bg-[#FFFFFF] hover:bg-[#F3F1EB] text-xs font-medium text-[#963F36] cursor-pointer"
                            >
                              Desfazer Conciliação
                            </button>
                          </div>
                        )}

                        {/* Manually Confirmed Information */}
                        {isManuallyConfirmed && (
                          <div className="mt-3 p-2.5 rounded bg-[#EAF0F6]/50 border border-[#D0E2F2] flex items-center justify-between text-xs font-sans">
                            <div className="flex items-center gap-2 text-[#205493]">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span>Confirmado manualmente sem vínculo com extrato bancário.</span>
                            </div>
                            <button
                              onClick={() => handleUnreconcile(occ.id)}
                              disabled={isReconciling}
                              className="px-2.5 py-1 rounded border border-[#D0E2F2] bg-[#FFFFFF] hover:bg-[#F3F1EB] text-xs font-medium text-[#5F635C] cursor-pointer"
                            >
                              Desfazer
                            </button>
                          </div>
                        )}

                        {/* Reconciliation Suggestion / Action for Pending or Overdue */}
                        {(occ.status === 'PENDING' || occ.status === 'OVERDUE') && (
                          <div className="mt-3 pt-3 border-t border-[#F0EDE6] space-y-2">
                            {occ.bestMatch ? (
                              <div className="p-3 rounded-md bg-[#FAF8F5] border border-[#E7E1D7] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-[#242823]">
                                      Transação Correspondente Sugerida
                                    </span>
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#E4EFE6] text-[#245A3C] font-bold">
                                      Score: {Math.round(occ.bestMatch.score * 100)}%
                                    </span>
                                    {occ.isAmbiguous && (
                                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#F8E8E5] text-[#963F36] border border-[#EED0CC]">
                                        Ambiguidade: Múltiplas similares
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-[#5F635C]">
                                    {occ.bestMatch.transactionDate} • {occ.bestMatch.transactionDescription} •{' '}
                                    <strong className="text-[#242823] font-mono">{formatCurrency(occ.bestMatch.transactionAmount)}</strong>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleReconcile(occ.id, occ.bestMatch.transactionId, occ.bestMatch.transactionAmount)}
                                    disabled={isReconciling}
                                    className="px-3 py-1.5 rounded bg-[#253A32] text-white font-medium hover:bg-[#1B2B25] transition-colors cursor-pointer text-xs"
                                  >
                                    Conciliar com esta transação
                                  </button>
                                  <button
                                    onClick={() => handleManualConfirm(occ.id)}
                                    disabled={isReconciling}
                                    className="px-2.5 py-1.5 rounded border border-[#E7E1D7] bg-[#FFFFFF] hover:bg-[#F3F1EB] text-xs text-[#5F635C] cursor-pointer"
                                  >
                                    Confirmar Manual
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between text-xs text-[#777A72]">
                                <span>Nenhuma transação correspondente detectada automaticamente no extrato recente.</span>
                                <button
                                  onClick={() => handleManualConfirm(occ.id)}
                                  disabled={isReconciling}
                                  className="px-2.5 py-1 rounded border border-[#E7E1D7] bg-[#FFFFFF] hover:bg-[#F3F1EB] text-xs text-[#5F635C] cursor-pointer"
                                >
                                  Confirmar Manualmente
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Configured Recurring Flows Table */}
          <div className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-3">
            <h3 className="font-serif text-base font-bold text-[#242823]">
              Fluxos Recorrentes e Fontes de Renda Configurados ({recurringList.length})
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-[#E7E1D7] text-[#777A72] text-[11px] font-semibold uppercase">
                    <th className="py-2.5 px-3">Título / Descrição</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3">Periodicidade</th>
                    <th className="py-2.5 px-3">Valor / Natureza</th>
                    <th className="py-2.5 px-3">Vigência</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E1D7]">
                  {recurringList.map((rf) => (
                    <tr key={rf.id} className="hover:bg-[#F3F1EB] transition-colors">
                      <td className="py-3 px-3 font-semibold text-[#242823]">{rf.title}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${rf.type === 'INCOME' ? 'bg-[#E4EFE6] text-[#245A3C]' : 'bg-[#F8E8E5] text-[#963F36]'}`}>
                          {rf.type === 'INCOME' ? 'Receita' : 'Despesa'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[#5F635C] font-mono">{rf.frequency || 'MONTHLY'}</td>
                      <td className="py-3 px-3 font-mono font-bold">
                        <span className={rf.type === 'INCOME' ? 'text-[#245A3C]' : 'text-[#963F36]'}>
                          {formatCurrency(Number(rf.amount) || 0)}
                        </span>
                        <span className="text-[10px] text-[#777A72] font-sans font-normal ml-1">
                          ({rf.nature || 'CONFIRMED'})
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-[#5F635C]">
                        {rf.startDate || rf.startMonth} {rf.endDate ? `até ${rf.endDate}` : ''}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => handleToggleRecurring(rf.id, rf.isActive)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                            rf.isActive
                              ? 'bg-[#E4EFE6] text-[#245A3C] border border-[#D1E2D4]'
                              : 'bg-[#F0EDE6] text-[#777A72] border border-[#E7E1D7]'
                          }`}
                        >
                          {rf.isActive ? 'Ativo' : 'Pausado'}
                        </button>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleEditRecurring(rf)}
                            className="p-1 rounded text-[#253A32] hover:bg-[#E4EFE6] cursor-pointer"
                            title="Editar fluxo"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {rf.status !== 'ENDED' && (
                            <button
                              onClick={() => handleEndRecurring(rf.id)}
                              className="px-2 py-0.5 rounded border border-[#E7E1D7] text-[10px] text-[#777A72] hover:bg-[#F0EDE6] cursor-pointer"
                              title="Encerrar fluxo"
                            >
                              Encerrar
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteRecurring(rf.id)}
                            className="p-1 rounded text-[#963F36] hover:bg-[#F8E8E5] cursor-pointer"
                            title="Excluir fluxo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SECTION 5: SIMULADOR DE CENÁRIOS & INDEPENDÊNCIA FINANCEIRA
         ===================================================================== */}
      {activeSection === 'simulator' && (
        <div className="space-y-6">
          {/* Configuration Form */}
          <form
            onSubmit={handleRunSimulation}
            className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-4 text-xs"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[#E7E1D7]">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#242823]">
                  Simulador Determinístico de Acumulação & Independência Financeira
                </h3>
                <p className="text-xs text-[#5F635C]">
                  Avalie cenários hipotéticos em Valores Nominais e Valores Reais (descontada a inflação pela Equação de Fisher). Não executa ordens nem garante rentabilidade.
                </p>
              </div>
              <button
                type="submit"
                disabled={isSimulating}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#253A32] hover:bg-[#1B2B25] text-white font-medium cursor-pointer shrink-0"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>{isSimulating ? 'Calculando...' : 'Simular Cenários'}</span>
              </button>
            </div>

            {simError && (
              <div className="p-3 rounded border border-[#EED0CC] bg-[#F8E8E5] text-[#963F36] font-medium">
                {simError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                  Patrimônio / Capital Inicial (R$)
                </label>
                <input
                  type="number"
                  step="any"
                  value={simInitialCapital}
                  onChange={(e) => setSimInitialCapital(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                  Contribuição Periódica Mensal (R$)
                </label>
                <input
                  type="number"
                  step="any"
                  value={simMonthlyContribution}
                  onChange={(e) => setSimMonthlyContribution(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                  Horizonte Temporal (Meses: 1 a 720)
                </label>
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={simHorizonMonths}
                  onChange={(e) => setSimHorizonMonths(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                  Taxa de Retorno Nominal Hipotética (% a.a.)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={simNominalReturn}
                  onChange={(e) => setSimNominalReturn(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                  Inflação Anual Hipotética (% a.a.)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={simInflation}
                  onChange={(e) => setSimInflation(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                  Renda Mensal Real Desejada na IF (R$)
                </label>
                <input
                  type="number"
                  step="any"
                  value={simDesiredIncome}
                  onChange={(e) => setSimDesiredIncome(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                  Taxa de Retirada Hipotética (% a.a.)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={simWithdrawalRate}
                  onChange={(e) => setSimWithdrawalRate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
                />
              </div>

              <div className="p-2.5 rounded bg-[#F6F3ED] border border-[#E7E1D7] flex flex-col justify-center">
                <div className="text-[10px] text-[#777A72] uppercase font-semibold">
                  Taxa Real Equivalente (Fisher)
                </div>
                <div className="font-mono font-bold text-sm text-[#245A3C]">
                  {simResult?.rates?.annualRealReturnPct ?? 0}% a.a. ({simResult?.rates?.monthlyRealRatePct ?? 0}% a.m.)
                </div>
              </div>
            </div>
          </form>

          {simResult && simResult.isValid && (
            <>
              {/* Nominal vs Real Explicit Comparison Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
                  <div className="text-[11px] font-semibold text-[#777A72] uppercase">
                    Patrimônio Final Real (Poder de Compra)
                  </div>
                  <div className="text-2xl font-serif font-bold text-[#245A3C] tabular-nums mt-1">
                    {formatCurrency(simResult.baseResult.finalRealBalance)}
                  </div>
                  <div className="text-[11px] text-[#5F635C] mt-1 font-mono">
                    Total aportado: {formatCurrency(simResult.baseResult.totalContributed)} | Juros reais: {formatCurrency(simResult.baseResult.totalRealYield)}
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
                  <div className="text-[11px] font-semibold text-[#777A72] uppercase">
                    Patrimônio Final Nominal (Sem Deflação)
                  </div>
                  <div className="text-2xl font-serif font-bold text-[#242823] tabular-nums mt-1">
                    {formatCurrency(simResult.baseResult.finalNominalBalance)}
                  </div>
                  <div className="text-[11px] text-[#5F635C] mt-1 font-mono">
                    Deflacionado c/ aporte fixo: {formatCurrency(simResult.baseResult.finalDeflatedFixedNominalBalance)}
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
                  <div className="text-[11px] font-semibold text-[#777A72] uppercase">
                    Renda Mensal Sustentável Hipotética ({simResult.inputs.safeWithdrawalRatePct}% a.a.)
                  </div>
                  <div className="text-2xl font-serif font-bold text-[#253A32] tabular-nums mt-1">
                    {formatCurrency(simResult.financialIndependence.projectedSustainableMonthlyIncomeReal)}
                  </div>
                  <div className="text-[11px] text-[#5F635C] mt-1 font-mono">
                    Capital alvo p/ {formatCurrency(simResult.inputs.desiredMonthlyIncome)}: {formatCurrency(simResult.financialIndependence.requiredCapitalAtConfiguredRate)}
                  </div>
                </div>
              </div>

              {/* Trajectory Chart */}
              <div className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-serif text-base font-bold text-[#242823]">
                    Curva de Acumulação Hipotética ({simResult.inputs.horizonMonths} meses / {simResult.inputs.horizonYears} anos)
                  </h4>
                  <span className="text-[11px] font-mono text-[#777A72]">
                    Valores Reais vs. Valores Nominais
                  </span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={simResult.timeline.filter(
                        (_: any, idx: number) =>
                          idx === 0 ||
                          idx === simResult.timeline.length - 1 ||
                          idx % Math.max(1, Math.floor(simResult.timeline.length / 24)) === 0
                      )}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E7E1D7" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#5F635C' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#5F635C' }} />
                      <Tooltip
                        formatter={(val: any) => formatCurrency(Number(val))}
                        labelFormatter={(m) => `Mês ${m}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="nominalBalance"
                        name="Saldo Nominal (Bruto)"
                        stroke="#B29A70"
                        fill="#F5EEDB"
                        fillOpacity={0.5}
                      />
                      <Area
                        type="monotone"
                        dataKey="realBalancePurchasingPower"
                        name="Saldo Real (Poder de Compra Hoje)"
                        stroke="#245A3C"
                        fill="#E4EFE6"
                        fillOpacity={0.8}
                      />
                      <Area
                        type="monotone"
                        dataKey="totalContributedReal"
                        name="Capital Aportado Acumulado"
                        stroke="#2A4365"
                        fill="#D1E2D4"
                        fillOpacity={0.4}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Scenarios & FI Sensitivity Matrix */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* 3 Return Scenarios + Contribution Sensitivity (6 cols) */}
                <div className="lg:col-span-6 p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] space-y-4 text-xs">
                  <h4 className="font-serif text-base font-bold text-[#242823] pb-2 border-b border-[#E7E1D7]">
                    Sensibilidade à Taxa de Retorno e ao Aporte Mensal
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse font-mono text-[11px] min-w-[380px]">
                    <thead>
                      <tr className="border-b border-[#E7E1D7] text-[#777A72] font-sans uppercase">
                        <th className="py-1.5">Cenário</th>
                        <th className="py-1.5 text-right">Taxa Real</th>
                        <th className="py-1.5 text-right">Saldo Real Final</th>
                        <th className="py-1.5 text-right">Saldo Nominal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E7E1D7]">
                      {simResult.scenarios.map((s: any) => (
                        <tr key={s.id}>
                          <td className="py-2 font-sans font-semibold text-[#242823]">{s.label}</td>
                          <td className="py-2 text-right">{s.annualRealReturnPct}% a.a.</td>
                          <td className="py-2 text-right font-bold text-[#245A3C]">
                            {formatCurrency(s.finalRealBalance)}
                          </td>
                          <td className="py-2 text-right text-[#5F635C]">
                            {formatCurrency(s.finalNominalBalance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>

                  <div className="pt-2">
                    <div className="text-[11px] font-semibold text-[#5F635C] mb-1.5">
                      Impacto de Variações na Contribuição Mensal (±20%):
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {simResult.contributionSensitivity.map((cs: any, i: number) => (
                        <div key={i} className="p-2.5 rounded border border-[#E7E1D7] bg-[#F6F3ED] font-mono">
                          <div className="font-sans text-[10px] text-[#777A72]">{cs.deltaLabel}</div>
                          <div className="font-bold text-[#242823] text-xs mt-0.5">
                            {formatCurrency(cs.monthlyContribution)}/mês
                          </div>
                          <div className="text-[11px] text-[#245A3C] mt-0.5">
                            {formatCurrency(cs.finalRealBalance)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Withdrawal Rate Sensitivity & Methodology (6 cols) */}
                <div className="lg:col-span-6 p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] space-y-4 text-xs">
                  <h4 className="font-serif text-base font-bold text-[#242823] pb-2 border-b border-[#E7E1D7]">
                    Sensibilidade da Taxa de Retirada (Independência Financeira)
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse font-mono text-[11px] min-w-[380px]">
                      <thead>
                        <tr className="border-b border-[#E7E1D7] text-[#777A72] font-sans uppercase">
                          <th className="py-1.5">Taxa Anual</th>
                          <th className="py-1.5 text-right">Capital Necessário (Real)</th>
                          <th className="py-1.5 text-right">Renda Projetada/Mês</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E7E1D7]">
                        {simResult.financialIndependence.withdrawalSensitivity.map((w: any) => (
                          <tr key={w.annualWithdrawalRatePct}>
                            <td className="py-2 font-bold text-[#242823]">
                              {w.annualWithdrawalRatePct}% a.a.
                            </td>
                            <td className="py-2 text-right">{formatCurrency(w.requiredCapitalReal)}</td>
                            <td
                              className={`py-2 text-right font-bold ${
                                w.reachesDesiredIncomeInHorizon ? 'text-[#245A3C]' : 'text-[#795C24]'
                              }`}
                            >
                              {formatCurrency(w.projectedSustainableMonthlyIncomeReal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-3 rounded bg-[#F6F3ED] border border-[#E7E1D7] space-y-1.5 text-[11px] text-[#5F635C]">
                    <div className="font-semibold text-[#242823]">
                      Fórmulas, Convenção Temporal e Limitações:
                    </div>
                    <p>{simResult.methodologyAndLimitations.valueBasisNotice}</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {simResult.methodologyAndLimitations.limitationsAndRisks.map(
                        (lim: string, idx: number) => (
                          <li key={idx}>{lim}</li>
                        )
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* =====================================================================
          SECTION 6: ALERTAS PREVENTIVOS & LIMITES CONFIGURÁVEIS
         ===================================================================== */}
      {activeSection === 'alerts' && (
        <div className="space-y-6">
          {/* Threshold Configuration Panel */}
          <form
            onSubmit={handleSaveAlertPreferences}
            className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-4 text-xs"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#E7E1D7]">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#253A32]" />
                <h3 className="font-serif text-base font-bold text-[#242823]">
                  Regras e Limites Determinísticos de Alertas
                </h3>
              </div>
              <button
                type="submit"
                disabled={isSavingPrefs}
                className="px-3.5 py-1.5 rounded bg-[#253A32] text-white font-medium cursor-pointer"
              >
                {isSavingPrefs ? 'Gravando...' : 'Atualizar Limites'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                  Liquidez Mínima Projetada (R$)
                </label>
                <input
                  type="number"
                  step="50"
                  min="0"
                  value={prefMinLiquidity}
                  onChange={(e) => setPrefMinLiquidity(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                  Alerta de Proximidade Orçamento (%)
                </label>
                <input
                  type="number"
                  min="10"
                  max="100"
                  value={prefWarningPct}
                  onChange={(e) => setPrefWarningPct(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                  Limite de Estouro Orçamento (%)
                </label>
                <input
                  type="number"
                  min="50"
                  max="200"
                  value={prefCriticalPct}
                  onChange={(e) => setPrefCriticalPct(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                  Aviso de Vencimento de Passivo (Dias)
                </label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={prefDueDays}
                  onChange={(e) => setPrefDueDays(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#5F635C] mb-1">
                  Defasagem Máx. de Dados (Dias)
                </label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={prefStaleDays}
                  onChange={(e) => setPrefStaleDays(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-[#D6CFC2] bg-[#FAF8F5] font-mono"
                />
              </div>
            </div>
          </form>

          {/* Traceable Alerts Ledger */}
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <div className="p-8 text-center rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] text-xs text-[#5F635C]">
                Nenhum alerta gerado pelas regras configuradas no período {selectedMonth}.
              </div>
            ) : (
              alerts.map((alert) => {
                const isDismissed = alert.status === 'DISMISSED';
                const isCrit = alert.severity === 'CRITICAL';
                return (
                  <div
                    key={alert.fingerprint}
                    className={`p-4 rounded-lg border text-xs space-y-2 transition-opacity ${
                      isDismissed
                        ? 'bg-[#FAF8F5] border-[#E7E1D7] opacity-60'
                        : isCrit
                        ? 'bg-[#F8E8E5] border-[#EED0CC]'
                        : 'bg-[#FFFFFF] border-[#E7E1D7]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            isCrit
                              ? 'bg-[#963F36] text-white'
                              : 'bg-[#F5EEDB] text-[#795C24] border border-[#E8DEC7]'
                          }`}
                        >
                          {alert.severity}
                        </span>
                        <span className="font-bold text-[#242823] text-sm">{alert.title}</span>
                        <span className="font-mono text-[11px] text-[#777A72]">
                          Período: {alert.period}
                        </span>
                      </div>

                      <button
                        onClick={() => handleToggleAlertStatus(alert.fingerprint, alert.status)}
                        className="px-2.5 py-1 rounded border border-[#D6CFC2] bg-[#FFFFFF] text-[#242823] text-[11px] font-medium cursor-pointer self-start sm:self-auto"
                      >
                        {isDismissed ? 'Reativar Alerta' : 'Suprimir / Marcar Ciente'}
                      </button>
                    </div>

                    <p className="text-[#242823] leading-relaxed">{alert.reason}</p>

                    <div className="p-2.5 rounded bg-[#F6F3ED] border border-[#E7E1D7] font-mono text-[11px] text-[#5F635C]">
                      <span className="font-semibold text-[#242823]">Fundamentação Rastreável: </span>
                      {JSON.stringify(alert.foundationData)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
