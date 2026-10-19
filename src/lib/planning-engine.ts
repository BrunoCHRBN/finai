/**
 * FinAI Sprint 4 — Deterministic Financial Planning, Budgets, Goals, Cash Flow Projections & Alerts Engine
 *
 * Architectural Principles:
 * 1. 100% Deterministic & Reproducible: Same inputs always yield the exact same outputs (0 AI tokens).
 * 2. Monetary Precision: All monetary calculations use integer-cent rounding (`roundCurrency`) to eliminate IEEE-754 drift.
 * 3. Accounting Integrity (Sprints 1–3 compatibility):
 *    - Self-transfers (`TRANSFER`) and credit card invoice settlements are never counted as income or expense.
 *    - Ignored transactions (`isIgnored = 1`) are strictly excluded.
 *    - Credit card purchases (`DEBIT`) count once as operating expenses; open card balances are never double-counted with same-month purchases.
 * 4. Strict Epistemic Separation:
 *    - REALIZED: Historical movements verified in ledger.
 *    - CONFIRMED: Scheduled commitments with identifiable basis (contracts, liabilities, active recurring rules, goal contributions).
 *    - ESTIMATED: Projections derived from explicit, user-auditable hypotheses.
 */

import {
  normalizeTransactionValues,
  detectAndReconcileSelfTransfers,
  isInvoicePaymentDescription,
  isExpenseRefundOrEstorno,
} from './transactions.ts';
import {
  addDays,
  clampDay,
  formatDateIso,
  generateOccurrencesForFlow,
  type RecurringFlowType,
  type RecurringFlowNature,
  type RecurringFlowAmountType,
  type RecurringFrequency,
  type RecurringFlowStatus,
} from './recurring-engine.ts';

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function safeNumeric(val: unknown, fallback = 0): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) && !Number.isNaN(val) ? val : fallback;
  }
  if (typeof val === 'string') {
    const cleaned = val.trim().replace(',', '.');
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) && !Number.isNaN(parsed) ? parsed : fallback;
  }
  return fallback;
}

/**
 * Advances a YYYY-MM string by `offset` months deterministically.
 */
export function addMonths(monthStr: string, offset: number): string {
  const parts = (monthStr || '').split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (Number.isNaN(year) || Number.isNaN(month)) return monthStr;

  const totalMonths = year * 12 + (month - 1) + offset;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}`;
}

/**
 * Calculates integer months from `fromMonth` (YYYY-MM) to `toDateOrMonth` (YYYY-MM or YYYY-MM-DD).
 */
export function monthsBetween(fromMonth: string, toDateOrMonth: string): number {
  const fromParts = (fromMonth || '').split('-');
  const toParts = (toDateOrMonth || '').split('-');
  const y1 = parseInt(fromParts[0], 10);
  const m1 = parseInt(fromParts[1], 10);
  const y2 = parseInt(toParts[0], 10);
  const m2 = parseInt(toParts[1], 10);
  if (Number.isNaN(y1) || Number.isNaN(m1) || Number.isNaN(y2) || Number.isNaN(m2)) {
    return 0;
  }
  return (y2 - y1) * 12 + (m2 - m1);
}

// ============================================================================
// 1. INPUT & DOMAIN TYPES
// ============================================================================

export interface PlanningTransactionInput {
  id: string;
  accountId: string;
  accountType?: string | null;
  categoryId?: string | null;
  description?: string | null;
  amount: number | string;
  date: string; // YYYY-MM-DD
  type?: string | null;
  status?: string | null;
  isIgnored?: number | boolean | null;
  transferId?: string | null;
}

export interface PlanningAccountInput {
  id: string;
  name: string;
  type: string; // CHECKING, SAVINGS, INVESTMENT, CREDIT_CARD
  balance: number | string | null | undefined;
  updatedAt?: string | null;
}

export interface PlanningCategoryInput {
  id: string;
  name: string;
  group: string; // FIXED, VARIABLE, INVESTMENT, INCOME
  color?: string | null;
  icon?: string | null;
  budgetLimit?: number | string | null;
}

export interface BudgetHistoryEntry {
  timestamp: string;
  previousAmount: number;
  newAmount: number;
  previousStatus?: string;
  newStatus?: string;
  note?: string;
}

export interface PlanningBudgetRecordInput {
  id: string;
  month: string; // YYYY-MM
  categoryId: string;
  name?: string | null;
  plannedAmount: number | string;
  status?: 'ACTIVE' | 'CLOSED' | string | null;
  historyJson?: string | null;
  updatedAt?: string | null;
}

export interface PlanningGoalInput {
  id: string;
  title: string;
  purpose?: string | null;
  targetAmount: number | string;
  currentAmount: number | string;
  plannedMonthlyContribution?: number | string | null;
  deadline?: string | null; // YYYY-MM or YYYY-MM-DD
  category?: string | null;
  status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | string | null;
  priority?: number | null;
  linkedAccountId?: string | null;
  color?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RecurringFlowInput {
  id: string;
  title: string;
  type: 'INCOME' | 'EXPENSE' | string;
  nature?: 'CONFIRMED' | 'ESTIMATED' | string | null;
  categoryId?: string | null;
  amount: number | string;
  amountType?: 'FIXED' | 'VARIABLE' | string | null;
  frequency?: 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'ONCE' | string | null;
  dayOfMonth?: number | null;
  secondDayOfMonth?: number | null;
  startDate?: string | null;
  nextDate?: string | null;
  endDate?: string | null;
  startMonth: string; // YYYY-MM
  endMonth?: string | null; // YYYY-MM
  totalInstallments?: number | null;
  remainingInstallments?: number | null;
  isActive?: number | boolean | null;
  status?: 'ACTIVE' | 'PAUSED' | 'ENDED' | string | null;
  destinationAccountId?: string | null;
  incomeCategory?: string | null;
  notes?: string | null;
}

export interface RecurringOccurrenceInput {
  id: string;
  flowId: string;
  expectedDate: string; // YYYY-MM-DD
  expectedAmount: number | string;
  status: 'PENDING' | 'OVERDUE' | 'RECONCILED' | 'MANUALLY_CONFIRMED' | 'CANCELLED' | string;
  transactionId?: string | null;
  reconciledAmount?: number | string | null;
  reconciledAt?: string | null;
  confidenceScore?: number | null;
  notes?: string | null;
}

export interface PlanningLiabilityInput {
  id: string;
  name: string;
  category: string;
  currentBalance: number | string | null | undefined;
  monthlyPayment?: number | string | null;
  installmentsRemaining?: number | null;
  dueDate?: string | null; // YYYY-MM-DD
  creditor?: string | null;
  updatedAt?: string | null;
}

export interface AlertPreferencesInput {
  minLiquidityThreshold?: number;
  budgetWarningPct?: number;
  budgetCriticalPct?: number;
  maxDataStalenessDays?: number;
  liabilityDueSoonDays?: number;
}

// ============================================================================
// 2. CANONICAL TRANSACTION PREPARATION & PERIOD AGGREGATION
// ============================================================================

export interface ReconciledPlanningTransaction {
  id: string;
  accountId: string;
  accountType?: string | null;
  categoryId: string | null;
  description: string;
  amount: number;
  date: string;
  type: 'CREDIT' | 'DEBIT' | 'TRANSFER';
  isIgnored: number;
  transferId: string | null;
}

/**
 * Prepares and reconciles transactions respecting all Sprint 1–3 accounting rules:
 * - Normalizes amounts and types
 * - Marks credit card invoice settlements as TRANSFER
 * - Reconciles self-transfers between user's own accounts
 */
export function prepareCanonicalTransactions(
  rawTransactions: PlanningTransactionInput[],
  accounts: PlanningAccountInput[]
): ReconciledPlanningTransaction[] {
  const accountTypeMap = new Map<string, string>(
    accounts.map((a) => [a.id, (a.type || 'CHECKING').toUpperCase()])
  );

  const normalized = rawTransactions.map((tx) => {
    const norm = normalizeTransactionValues({
      amount: tx.amount,
      type: tx.type,
      description: tx.description,
      isIgnored: tx.isIgnored,
      transferId: tx.transferId,
    });

    let finalType = norm.type;
    if (isInvoicePaymentDescription(tx.description)) {
      finalType = 'TRANSFER';
    }

    const resolvedAccType =
      tx.accountType || accountTypeMap.get(tx.accountId) || 'CHECKING';

    return {
      id: tx.id,
      accountId: tx.accountId,
      accountType: resolvedAccType,
      categoryId: tx.categoryId || null,
      description: tx.description || '',
      amount: norm.amount,
      date: tx.date,
      type: finalType,
      isIgnored: norm.isIgnored,
      transferId: norm.transferId || null,
    };
  });

  const accountIds = new Set(accounts.map((a) => a.id));
  if (accountIds.size > 0) {
    return detectAndReconcileSelfTransfers(normalized, accountIds);
  }
  return normalized;
}

export interface PeriodOperatingTotals {
  month: string;
  transactionCount: number;
  operatingTransactionCount: number;
  ignoredTransactionCount: number;
  transferTransactionCount: number;
  realizedIncome: number;
  realizedExpenses: number;
  realizedNetCashFlow: number;
  spentByCategoryId: Record<string, number>;
  unassignedExpenseAmount: number;
}

/**
 * Aggregates operating income and expenses for a given YYYY-MM period.
 * Excludes TRANSFER, ignored transactions, and invoice settlements.
 * Offsets credit card and purchase refunds (estornos) against operating expenses without inflating income.
 */
export function aggregatePeriodTransactions(
  reconciledTransactions: ReconciledPlanningTransaction[],
  month: string
): PeriodOperatingTotals {
  const monthTxs = reconciledTransactions.filter((tx) => tx.date && tx.date.startsWith(month));

  let operatingTransactionCount = 0;
  let ignoredTransactionCount = 0;
  let transferTransactionCount = 0;
  let realizedIncome = 0;
  let realizedExpenses = 0;
  let unassignedExpenseAmount = 0;
  const spentByCategoryId: Record<string, number> = {};

  for (const tx of monthTxs) {
    if (tx.isIgnored === 1) {
      ignoredTransactionCount += 1;
      continue;
    }
    if (tx.type === 'TRANSFER' || isInvoicePaymentDescription(tx.description)) {
      transferTransactionCount += 1;
      continue;
    }

    operatingTransactionCount += 1;
    const absVal = roundCurrency(Math.abs(tx.amount));

    if (
      isExpenseRefundOrEstorno({
        type: tx.type,
        description: tx.description,
        accountType: tx.accountType,
      })
    ) {
      realizedExpenses = roundCurrency(realizedExpenses - absVal);
      if (tx.categoryId) {
        spentByCategoryId[tx.categoryId] = roundCurrency(
          (spentByCategoryId[tx.categoryId] || 0) - absVal
        );
      } else {
        unassignedExpenseAmount = roundCurrency(unassignedExpenseAmount - absVal);
      }
      continue;
    }

    if (tx.type === 'CREDIT') {
      realizedIncome = roundCurrency(realizedIncome + absVal);
    } else if (tx.type === 'DEBIT') {
      realizedExpenses = roundCurrency(realizedExpenses + absVal);
      if (tx.categoryId) {
        spentByCategoryId[tx.categoryId] = roundCurrency(
          (spentByCategoryId[tx.categoryId] || 0) + absVal
        );
      } else {
        unassignedExpenseAmount = roundCurrency(unassignedExpenseAmount + absVal);
      }
    }
  }

  realizedIncome = roundCurrency(Math.max(0, realizedIncome));
  realizedExpenses = roundCurrency(Math.max(0, realizedExpenses));
  unassignedExpenseAmount = roundCurrency(Math.max(0, unassignedExpenseAmount));
  for (const catId of Object.keys(spentByCategoryId)) {
    spentByCategoryId[catId] = roundCurrency(Math.max(0, spentByCategoryId[catId]));
  }

  return {
    month,
    transactionCount: monthTxs.length,
    operatingTransactionCount,
    ignoredTransactionCount,
    transferTransactionCount,
    realizedIncome,
    realizedExpenses,
    realizedNetCashFlow: roundCurrency(realizedIncome - realizedExpenses),
    spentByCategoryId,
    unassignedExpenseAmount,
  };
}

// ============================================================================
// 3. CATEGORY BUDGETS & EXECUTION ENGINE
// ============================================================================

export type BudgetAlertIndicator =
  | 'WITHIN_LIMIT'
  | 'NEAR_LIMIT'
  | 'OVER_BUDGET'
  | 'UNBUDGETED'
  | 'CLOSED'
  | 'NO_ACTIVITY';

export interface CategoryBudgetExecutionItem {
  budgetId: string | null;
  categoryId: string;
  categoryName: string;
  budgetName: string;
  categoryGroup: string;
  color: string;
  month: string;
  status: 'ACTIVE' | 'CLOSED';
  plannedAmount: number;
  realizedSpent: number;
  remainingBalance: number;
  executionPct: number;
  indicator: BudgetAlertIndicator;
  isOverBudget: boolean;
  isNearLimit: boolean;
  isUnbudgeted: boolean;
  history: BudgetHistoryEntry[];
  updatedAt: string | null;
}

export interface BudgetExecutionSummary {
  month: string;
  hasMovementsInPeriod: boolean;
  totalPlanned: number;
  totalRealizedExpenses: number;
  totalBudgetedRealizedSpent: number;
  totalUnbudgetedSpent: number;
  totalRemainingBalance: number;
  globalExecutionPct: number;
  warningThresholdPct: number;
  criticalThresholdPct: number;
  activeBudgetsCount: number;
  closedBudgetsCount: number;
  overBudgetCount: number;
  nearLimitCount: number;
  unbudgetedWithSpendCount: number;
  items: CategoryBudgetExecutionItem[];
}

export function calculateBudgetExecution(
  month: string,
  categories: PlanningCategoryInput[],
  periodBudgets: PlanningBudgetRecordInput[],
  reconciledTransactions: ReconciledPlanningTransaction[],
  preferences?: AlertPreferencesInput
): BudgetExecutionSummary {
  const warningPct = preferences?.budgetWarningPct ?? 80;
  const criticalPct = preferences?.budgetCriticalPct ?? 100;

  const periodTotals = aggregatePeriodTransactions(reconciledTransactions, month);
  const budgetByCatId = new Map<string, PlanningBudgetRecordInput>();
  for (const b of periodBudgets) {
    if (b.month === month) {
      budgetByCatId.set(b.categoryId, b);
    }
  }

  const expenseCategories = categories.filter(
    (c) => (c.group || '').toUpperCase() !== 'INCOME'
  );

  const items: CategoryBudgetExecutionItem[] = [];
  let totalPlanned = 0;
  let totalBudgetedRealizedSpent = 0;
  let totalUnbudgetedSpent = periodTotals.unassignedExpenseAmount;
  let activeBudgetsCount = 0;
  let closedBudgetsCount = 0;
  let overBudgetCount = 0;
  let nearLimitCount = 0;
  let unbudgetedWithSpendCount = periodTotals.unassignedExpenseAmount > 0 ? 1 : 0;

  for (const cat of expenseCategories) {
    const periodRecord = budgetByCatId.get(cat.id);
    const status: 'ACTIVE' | 'CLOSED' =
      periodRecord && (periodRecord.status || '').toUpperCase() === 'CLOSED'
        ? 'CLOSED'
        : 'ACTIVE';

    const rawPlanned =
      periodRecord !== undefined
        ? safeNumeric(periodRecord.plannedAmount, 0)
        : safeNumeric(cat.budgetLimit, 0);

    const plannedAmount = status === 'CLOSED' ? roundCurrency(Math.max(0, rawPlanned)) : roundCurrency(Math.max(0, rawPlanned));
    const realizedSpent = roundCurrency(periodTotals.spentByCategoryId[cat.id] || 0);

    let history: BudgetHistoryEntry[] = [];
    if (periodRecord?.historyJson) {
      try {
        const parsed = JSON.parse(periodRecord.historyJson);
        if (Array.isArray(parsed)) history = parsed;
      } catch {
        history = [];
      }
    }

    let executionPct = 0;
    if (plannedAmount > 0) {
      executionPct = roundCurrency((realizedSpent / plannedAmount) * 100);
    } else if (realizedSpent > 0) {
      executionPct = 100;
    }

    const remainingBalance = roundCurrency(plannedAmount - realizedSpent);

    let indicator: BudgetAlertIndicator;
    if (status === 'CLOSED') {
      indicator = 'CLOSED';
      closedBudgetsCount += 1;
      if (realizedSpent > 0) {
        totalUnbudgetedSpent = roundCurrency(totalUnbudgetedSpent + realizedSpent);
      }
    } else if (plannedAmount === 0 && realizedSpent === 0) {
      indicator = 'NO_ACTIVITY';
    } else if (plannedAmount === 0 && realizedSpent > 0) {
      indicator = 'UNBUDGETED';
      totalUnbudgetedSpent = roundCurrency(totalUnbudgetedSpent + realizedSpent);
      unbudgetedWithSpendCount += 1;
    } else {
      activeBudgetsCount += 1;
      totalPlanned = roundCurrency(totalPlanned + plannedAmount);
      totalBudgetedRealizedSpent = roundCurrency(totalBudgetedRealizedSpent + realizedSpent);

      if (executionPct > criticalPct) {
        indicator = 'OVER_BUDGET';
        overBudgetCount += 1;
      } else if (executionPct >= warningPct) {
        indicator = 'NEAR_LIMIT';
        nearLimitCount += 1;
      } else {
        indicator = 'WITHIN_LIMIT';
      }
    }

    items.push({
      budgetId: periodRecord?.id || null,
      categoryId: cat.id,
      categoryName: cat.name,
      budgetName: periodRecord?.name?.trim() || cat.name,
      categoryGroup: cat.group || 'VARIABLE',
      color: cat.color || '#64748b',
      month,
      status,
      plannedAmount,
      realizedSpent,
      remainingBalance,
      executionPct,
      indicator,
      isOverBudget: indicator === 'OVER_BUDGET',
      isNearLimit: indicator === 'NEAR_LIMIT',
      isUnbudgeted: indicator === 'UNBUDGETED',
      history,
      updatedAt: periodRecord?.updatedAt || null,
    });
  }

  // If there were expenses without any category, expose an explicit uncategorized row
  if (periodTotals.unassignedExpenseAmount > 0) {
    items.push({
      budgetId: null,
      categoryId: '__uncategorized__',
      categoryName: 'Sem Categoria Associada',
      budgetName: 'Sem Categoria Associada',
      categoryGroup: 'VARIABLE',
      color: '#94a3b8',
      month,
      status: 'ACTIVE',
      plannedAmount: 0,
      realizedSpent: periodTotals.unassignedExpenseAmount,
      remainingBalance: roundCurrency(-periodTotals.unassignedExpenseAmount),
      executionPct: 100,
      indicator: 'UNBUDGETED',
      isOverBudget: false,
      isNearLimit: false,
      isUnbudgeted: true,
      history: [],
      updatedAt: null,
    });
  }

  const totalRemainingBalance = roundCurrency(totalPlanned - totalBudgetedRealizedSpent);
  const globalExecutionPct =
    totalPlanned > 0 ? roundCurrency((totalBudgetedRealizedSpent / totalPlanned) * 100) : 0;

  return {
    month,
    hasMovementsInPeriod: periodTotals.operatingTransactionCount > 0,
    totalPlanned,
    totalRealizedExpenses: periodTotals.realizedExpenses,
    totalBudgetedRealizedSpent,
    totalUnbudgetedSpent,
    totalRemainingBalance,
    globalExecutionPct,
    warningThresholdPct: warningPct,
    criticalThresholdPct: criticalPct,
    activeBudgetsCount,
    closedBudgetsCount,
    overBudgetCount,
    nearLimitCount,
    unbudgetedWithSpendCount,
    items,
  };
}

// ============================================================================
// 4. FINANCIAL GOALS & NON-OVERLAPPING CAPITAL ALLOCATION ENGINE
// ============================================================================

export type GoalFeasibilityStatus =
  | 'COMPLETED'
  | 'ON_TRACK'
  | 'AT_RISK'
  | 'OVERDUE'
  | 'NO_DEADLINE'
  | 'PAUSED'
  | 'CANCELLED';

export interface EvaluatedFinancialGoal {
  id: string;
  title: string;
  purpose: string;
  category: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  priority: number;
  linkedAccountId: string | null;
  color: string;
  targetAmount: number;
  declaredCurrentAmount: number;
  backedByRealBalance: number;
  unbackedAmount: number;
  remainingAmount: number;
  progressPct: number;
  BackedProgressPct: number;
  plannedMonthlyContribution: number;
  deadline: string | null;
  monthsRemaining: number | null;
  requiredMonthlyContribution: number | null;
  contributionGap: number | null;
  estimatedMonthsToComplete: number | null;
  estimatedCompletionMonth: string | null;
  feasibility: GoalFeasibilityStatus;
}

export interface GoalsEvaluationSummary {
  referenceMonth: string;
  verifiedAvailableReserve: number; // Real liquid + investment balance across accounts
  totalTargetAmount: number;
  totalDeclaredCurrentAmount: number;
  totalBackedByRealBalance: number;
  totalUnbackedGoalAmount: number;
  unallocatedAvailableReserve: number;
  isReserveOverAllocated: boolean;
  totalPlannedMonthlyContributions: number;
  activeGoalsCount: number;
  completedGoalsCount: number;
  atRiskGoalsCount: number;
  goals: EvaluatedFinancialGoal[];
}

/**
 * Evaluates personal financial goals, required contributions to hit target dates,
 * and enforces strict priority-waterfall capital allocation so the same real R$ 1.00
 * is never counted simultaneously across two different goals.
 */
export function evaluateFinancialGoals(
  goalsInput: PlanningGoalInput[],
  accounts: PlanningAccountInput[],
  referenceMonth: string
): GoalsEvaluationSummary {
  // Compute real positive balances per account (excluding CREDIT_CARD)
  const accountBalances = new Map<string, number>();
  let totalVerifiedReserve = 0;

  for (const acc of accounts) {
    const type = (acc.type || '').toUpperCase();
    if (type === 'CREDIT_CARD') continue;
    const bal = roundCurrency(safeNumeric(acc.balance, 0));
    if (bal > 0) {
      accountBalances.set(acc.id, bal);
      totalVerifiedReserve = roundCurrency(totalVerifiedReserve + bal);
    } else {
      accountBalances.set(acc.id, 0);
    }
  }

  // Sort goals deterministically by priority ASC, then id ASC for waterfall allocation
  const sortedGoals = [...goalsInput].sort((a, b) => {
    const pA = a.priority ?? 1;
    const pB = b.priority ?? 1;
    if (pA !== pB) return pA - pB;
    return a.id.localeCompare(b.id);
  });

  let remainingGeneralPool = totalVerifiedReserve;
  const remainingByAccount = new Map(accountBalances);

  let totalTargetAmount = 0;
  let totalDeclaredCurrentAmount = 0;
  let totalBackedByRealBalance = 0;
  let totalUnbackedGoalAmount = 0;
  let totalPlannedMonthlyContributions = 0;
  let activeGoalsCount = 0;
  let completedGoalsCount = 0;
  let atRiskGoalsCount = 0;

  const evaluated: EvaluatedFinancialGoal[] = [];

  for (const g of sortedGoals) {
    const rawStatus = (g.status || 'ACTIVE').toUpperCase();
    const status: EvaluatedFinancialGoal['status'] =
      rawStatus === 'PAUSED' || rawStatus === 'COMPLETED' || rawStatus === 'CANCELLED'
        ? (rawStatus as EvaluatedFinancialGoal['status'])
        : 'ACTIVE';

    const targetAmount = roundCurrency(Math.max(0, safeNumeric(g.targetAmount, 0)));
    const declaredCurrentAmount = roundCurrency(Math.max(0, safeNumeric(g.currentAmount, 0)));
    const plannedMonthlyContribution = roundCurrency(
      Math.max(0, safeNumeric(g.plannedMonthlyContribution, 0))
    );

    // Allocate real balance without double-counting across goals
    let backedByRealBalance = 0;
    if (status !== 'CANCELLED') {
      if (g.linkedAccountId && remainingByAccount.has(g.linkedAccountId)) {
        const acctAvail = remainingByAccount.get(g.linkedAccountId) || 0;
        const alloc = roundCurrency(Math.min(declaredCurrentAmount, acctAvail, remainingGeneralPool));
        backedByRealBalance = alloc;
        remainingByAccount.set(g.linkedAccountId, roundCurrency(acctAvail - alloc));
        remainingGeneralPool = roundCurrency(remainingGeneralPool - alloc);
      } else {
        const alloc = roundCurrency(Math.min(declaredCurrentAmount, remainingGeneralPool));
        backedByRealBalance = alloc;
        remainingGeneralPool = roundCurrency(remainingGeneralPool - alloc);
      }
    }

    const unbackedAmount = roundCurrency(Math.max(0, declaredCurrentAmount - backedByRealBalance));
    const remainingAmount = roundCurrency(Math.max(0, targetAmount - declaredCurrentAmount));
    const progressPct =
      targetAmount > 0 ? roundCurrency(Math.min(100, (declaredCurrentAmount / targetAmount) * 100)) : 0;
    const BackedProgressPct =
      targetAmount > 0 ? roundCurrency(Math.min(100, (backedByRealBalance / targetAmount) * 100)) : 0;

    const deadline = g.deadline?.trim() || null;
    let monthsRemaining: number | null = null;
    let requiredMonthlyContribution: number | null = null;
    let contributionGap: number | null = null;
    let feasibility: GoalFeasibilityStatus = 'NO_DEADLINE';

    if (status === 'CANCELLED') {
      feasibility = 'CANCELLED';
    } else if (status === 'PAUSED') {
      feasibility = 'PAUSED';
    } else if (remainingAmount <= 0 || status === 'COMPLETED') {
      feasibility = 'COMPLETED';
      requiredMonthlyContribution = 0;
      contributionGap = plannedMonthlyContribution;
      completedGoalsCount += 1;
    } else if (deadline) {
      monthsRemaining = monthsBetween(referenceMonth, deadline);
      if (monthsRemaining <= 0) {
        feasibility = 'OVERDUE';
        requiredMonthlyContribution = remainingAmount;
        contributionGap = roundCurrency(plannedMonthlyContribution - remainingAmount);
        atRiskGoalsCount += 1;
      } else {
        requiredMonthlyContribution = roundCurrency(remainingAmount / monthsRemaining);
        contributionGap = roundCurrency(plannedMonthlyContribution - requiredMonthlyContribution);
        if (plannedMonthlyContribution >= requiredMonthlyContribution) {
          feasibility = 'ON_TRACK';
        } else {
          feasibility = 'AT_RISK';
          atRiskGoalsCount += 1;
        }
      }
    } else {
      feasibility = 'NO_DEADLINE';
    }

    let estimatedMonthsToComplete: number | null = null;
    let estimatedCompletionMonth: string | null = null;
    if (remainingAmount <= 0) {
      estimatedMonthsToComplete = 0;
      estimatedCompletionMonth = referenceMonth;
    } else if (plannedMonthlyContribution > 0 && status === 'ACTIVE') {
      estimatedMonthsToComplete = Math.ceil(remainingAmount / plannedMonthlyContribution);
      estimatedCompletionMonth = addMonths(referenceMonth, estimatedMonthsToComplete);
    }

    if (status === 'ACTIVE') {
      activeGoalsCount += 1;
      totalTargetAmount = roundCurrency(totalTargetAmount + targetAmount);
      totalDeclaredCurrentAmount = roundCurrency(totalDeclaredCurrentAmount + declaredCurrentAmount);
      totalBackedByRealBalance = roundCurrency(totalBackedByRealBalance + backedByRealBalance);
      totalUnbackedGoalAmount = roundCurrency(totalUnbackedGoalAmount + unbackedAmount);
      if (remainingAmount > 0) {
        totalPlannedMonthlyContributions = roundCurrency(
          totalPlannedMonthlyContributions + plannedMonthlyContribution
        );
      }
    } else if (status === 'COMPLETED') {
      totalTargetAmount = roundCurrency(totalTargetAmount + targetAmount);
      totalDeclaredCurrentAmount = roundCurrency(totalDeclaredCurrentAmount + declaredCurrentAmount);
      totalBackedByRealBalance = roundCurrency(totalBackedByRealBalance + backedByRealBalance);
      totalUnbackedGoalAmount = roundCurrency(totalUnbackedGoalAmount + unbackedAmount);
    }

    evaluated.push({
      id: g.id,
      title: g.title,
      purpose: g.purpose?.trim() || '',
      category: g.category || 'EMERGENCY',
      status,
      priority: g.priority ?? 1,
      linkedAccountId: g.linkedAccountId || null,
      color: g.color || '#10b981',
      targetAmount,
      declaredCurrentAmount,
      backedByRealBalance,
      unbackedAmount,
      remainingAmount,
      progressPct,
      BackedProgressPct,
      plannedMonthlyContribution,
      deadline,
      monthsRemaining,
      requiredMonthlyContribution,
      contributionGap,
      estimatedMonthsToComplete,
      estimatedCompletionMonth,
      feasibility,
    });
  }

  return {
    referenceMonth,
    verifiedAvailableReserve: totalVerifiedReserve,
    totalTargetAmount,
    totalDeclaredCurrentAmount,
    totalBackedByRealBalance,
    totalUnbackedGoalAmount,
    unallocatedAvailableReserve: roundCurrency(Math.max(0, remainingGeneralPool)),
    isReserveOverAllocated: totalUnbackedGoalAmount > 0,
    totalPlannedMonthlyContributions,
    activeGoalsCount,
    completedGoalsCount,
    atRiskGoalsCount,
    goals: evaluated,
  };
}

// ============================================================================
// 5. PROSPECTIVE CASH FLOW PROJECTION ENGINE
// ============================================================================

export interface ProjectionMonthBucket {
  month: string;
  monthIndex: number; // 0 = current reference month, 1..N = future months
  openingLiquidBalance: number;

  // 1. REALIZED (Movimentos efetivamente registrados no extrato)
  realized: {
    inflows: number;
    outflows: number;
    net: number;
  };

  // 2. CONFIRMED / SCHEDULED (Compromissos com base identificável)
  confirmed: {
    recurringInflows: number;
    recurringOutflows: number;
    liabilityInstallments: number;
    priorUnsettledCardInvoice: number;
    goalContributions: number;
    totalInflows: number;
    totalOutflows: number;
    net: number;
  };

  // 3. ESTIMATED (Projeções derivadas de hipóteses explícitas)
  estimated: {
    inflows: number;
    outflows: number;
    net: number;
  };

  // Projected Ending Balances
  closingConfirmedBalance: number; // Opening + Confirmed Net (or Current Live Balance for month 0 + remaining scheduled)
  closingTotalProjectedBalance: number; // Opening + Confirmed Net + Estimated Net
  isLiquidityBelowThreshold: boolean;
  isNegativeLiquidity: boolean;
}

export interface ProjectionHypothesis {
  code: string;
  category: 'CONFIRMED_RULE' | 'ESTIMATED_HYPOTHESIS' | 'ACCOUNTING_SAFEGUARD';
  description: string;
}

export interface CashFlowHorizonSummary {
  days: 30 | 60 | 90 | number;
  targetDate: string;
  projectedInflows: number;
  projectedOutflows: number;
  projectedNet: number;
  projectedClosingBalance: number;
  lowestProjectedBalance: number;
  lowestProjectedDate?: string;
  isNegativeLiquidity: boolean;
}

export interface CashFlowProjectionIndicators {
  realizedIncomePeriod: number;
  expectedIncomePeriod: number;
  activeRecurringIncome: number;
  overdueUnreconciledIncome: number;
  expectedExpensesPeriod: number;
  projectedClosingBalance: number;
  futureCommitmentRatePct: number;
  varianceExpectationVsRealized: number;
}

export interface CashFlowProjectionResult {
  referenceMonth: string;
  horizonMonths: number;
  initialLiquidBalance: number;
  priorUnsettledCardDebt: number;
  historicalContext: {
    analyzedMonths: string[];
    averageMonthlyIncome: number;
    averageMonthlyExpenses: number;
    note: string;
  };
  hypotheses: ProjectionHypothesis[];
  months: ProjectionMonthBucket[];
  lowestProjectedBalance: number;
  lowestProjectedMonth: string;
  indicators: CashFlowProjectionIndicators;
  horizonSummaries: {
    days30: CashFlowHorizonSummary;
    days60: CashFlowHorizonSummary;
    days90: CashFlowHorizonSummary;
  };
}

export function calculateCashFlowProjection(params: {
  referenceMonth: string;
  horizonMonths?: number;
  accounts: PlanningAccountInput[];
  reconciledTransactions: ReconciledPlanningTransaction[];
  recurringFlows: RecurringFlowInput[];
  liabilities: PlanningLiabilityInput[];
  goals: PlanningGoalInput[];
  minLiquidityThreshold?: number;
  occurrences?: RecurringOccurrenceInput[];
  todayDate?: string;
}): CashFlowProjectionResult {
  const {
    referenceMonth,
    accounts,
    reconciledTransactions,
    recurringFlows,
    liabilities,
    goals,
    occurrences = [],
    todayDate,
  } = params;

  const horizonMonths = Math.min(36, Math.max(1, Math.round(params.horizonMonths || 6)));
  const minLiquidityThreshold = params.minLiquidityThreshold ?? 1000;

  // 1. Calculate Initial Liquid Balance (Checking + Savings, factoring overdrafts; excluding CREDIT_CARD)
  // and open Credit Card balance
  let initialLiquidBalance = 0;
  let totalCreditCardBalance = 0;
  const creditCardAccountIds = new Set<string>();

  for (const acc of accounts) {
    const type = (acc.type || '').toUpperCase();
    const bal = roundCurrency(safeNumeric(acc.balance, 0));
    if (type === 'CREDIT_CARD') {
      creditCardAccountIds.add(acc.id);
      if (bal > 0) {
        totalCreditCardBalance = roundCurrency(totalCreditCardBalance + bal);
      }
    } else if (type === 'CHECKING' || type === 'SAVINGS') {
      initialLiquidBalance = roundCurrency(initialLiquidBalance + bal);
    }
  }

  // 2. Prevent double-counting credit card purchases vs open credit card invoice:
  // Any DEBIT on a CREDIT_CARD account in `referenceMonth` is already counted in `realized.outflows` of `referenceMonth`.
  // Only the portion of `totalCreditCardBalance` exceeding `referenceMonth` card purchases is an unsettled prior invoice!
  let currentMonthCardPurchases = 0;
  for (const tx of reconciledTransactions) {
    if (
      tx.date &&
      tx.date.startsWith(referenceMonth) &&
      tx.isIgnored === 0 &&
      creditCardAccountIds.has(tx.accountId)
    ) {
      if (tx.type === 'DEBIT') {
        currentMonthCardPurchases = roundCurrency(currentMonthCardPurchases + Math.abs(tx.amount));
      } else if (tx.type === 'CREDIT') {
        currentMonthCardPurchases = roundCurrency(currentMonthCardPurchases - Math.abs(tx.amount));
      }
    }
  }
  currentMonthCardPurchases = roundCurrency(Math.max(0, currentMonthCardPurchases));
  const priorUnsettledCardDebt = roundCurrency(
    Math.max(0, totalCreditCardBalance - currentMonthCardPurchases)
  );

  // 3. Historical Context (strictly informational, NOT auto-projected as guaranteed income/expense)
  const distinctMonths = Array.from(
    new Set(
      reconciledTransactions
        .filter((t) => t.isIgnored === 0 && t.type !== 'TRANSFER' && t.date)
        .map((t) => t.date.slice(0, 7))
        .filter((m) => m <= referenceMonth)
    )
  ).sort();

  let sumHistIncome = 0;
  let sumHistExpense = 0;
  for (const m of distinctMonths) {
    const agg = aggregatePeriodTransactions(reconciledTransactions, m);
    sumHistIncome = roundCurrency(sumHistIncome + agg.realizedIncome);
    sumHistExpense = roundCurrency(sumHistExpense + agg.realizedExpenses);
  }
  const histDivisor = distinctMonths.length || 1;
  const averageMonthlyIncome =
    distinctMonths.length > 0 ? roundCurrency(sumHistIncome / histDivisor) : 0;
  const averageMonthlyExpenses =
    distinctMonths.length > 0 ? roundCurrency(sumHistExpense / histDivisor) : 0;

  // 4. Track remaining goal targets so projected contributions stop once a goal is fulfilled
  const activeGoalTrackers = goals
    .filter((g) => (g.status || 'ACTIVE').toUpperCase() === 'ACTIVE')
    .map((g) => ({
      id: g.id,
      title: g.title,
      remainingToTarget: roundCurrency(
        Math.max(0, safeNumeric(g.targetAmount, 0) - safeNumeric(g.currentAmount, 0))
      ),
      monthlyContribution: roundCurrency(Math.max(0, safeNumeric(g.plannedMonthlyContribution, 0))),
    }))
    .filter((g) => g.remainingToTarget > 0 && g.monthlyContribution > 0);

  // 5. Track structured liabilities so installments stop when remaining balance or installments end
  const activeLiabilityTrackers = liabilities
    .map((l) => ({
      id: l.id,
      name: l.name,
      remainingBalance: roundCurrency(Math.max(0, safeNumeric(l.currentBalance, 0))),
      monthlyPayment: roundCurrency(Math.max(0, safeNumeric(l.monthlyPayment, 0))),
      installmentsRemaining:
        l.installmentsRemaining !== null && l.installmentsRemaining !== undefined
          ? Math.max(0, Number(l.installmentsRemaining))
          : null,
    }))
    .filter((l) => l.remainingBalance > 0 && l.monthlyPayment > 0);

  // 6. Track recurring flows
  const activeRecurring = recurringFlows.filter(
    (rf) => rf.isActive === undefined || rf.isActive === null || rf.isActive === 1 || rf.isActive === true
  );

  const months: ProjectionMonthBucket[] = [];
  let runningConfirmedBalance = initialLiquidBalance;
  let runningTotalProjectedBalance = initialLiquidBalance;

  for (let idx = 0; idx <= horizonMonths; idx++) {
    const targetMonth = addMonths(referenceMonth, idx);
    const openingBalance = idx === 0 ? initialLiquidBalance : runningTotalProjectedBalance;

    // A. Realized transactions for targetMonth
    const realizedAgg = aggregatePeriodTransactions(reconciledTransactions, targetMonth);
    const realized = {
      inflows: realizedAgg.realizedIncome,
      outflows: realizedAgg.realizedExpenses,
      net: realizedAgg.realizedNetCashFlow,
    };

    // B. Confirmed & Estimated Recurring Flows for targetMonth
    let confirmedRecurringInflows = 0;
    let confirmedRecurringOutflows = 0;
    let estimatedInflows = 0;
    let estimatedOutflows = 0;

    for (const rf of activeRecurring) {
      const amount = roundCurrency(Math.abs(safeNumeric(rf.amount, 0)));
      if (amount <= 0) continue;

      const startM = rf.startMonth || referenceMonth;
      const endM = rf.endMonth || null;
      const freq = (rf.frequency || 'MONTHLY').toUpperCase();

      // Check date applicability
      if (targetMonth < startM) continue;
      if (endM && targetMonth > endM) continue;
      if (freq === 'ONCE' && targetMonth !== startM) continue;

      // Check installment bounds if present
      if (rf.remainingInstallments !== null && rf.remainingInstallments !== undefined) {
        const effStart = startM > referenceMonth ? startM : referenceMonth;
        const monthsSinceStart = Math.max(0, monthsBetween(effStart, targetMonth));
        if (monthsSinceStart >= Number(rf.remainingInstallments)) {
          continue;
        }
      }

      // Check if explicit occurrences are provided for this flow in targetMonth
      const occsForTargetMonth = occurrences.filter(
        (o) =>
          o.flowId === rf.id &&
          o.expectedDate &&
          o.expectedDate.startsWith(targetMonth) &&
          o.status !== 'CANCELLED'
      );

      let effectiveAmount = 0;

      if (occsForTargetMonth.length > 0) {
        for (const occ of occsForTargetMonth) {
          // If occurrence is already reconciled, check if the reconciled transaction is already in realized transactions
          if (occ.status === 'RECONCILED' && occ.transactionId) {
            const alreadyRealized = reconciledTransactions.some((t) => t.id === occ.transactionId);
            if (alreadyRealized) {
              // Already accounted for in realized inflows/outflows; do not duplicate
              continue;
            }
          }
          effectiveAmount = roundCurrency(effectiveAmount + Math.abs(safeNumeric(occ.expectedAmount, 0)));
        }
      } else {
        // Evaluate exact concrete occurrences in targetMonth (no proportional monthly multipliers)
        const [tYStr, tMStr] = targetMonth.split('-');
        const tY = parseInt(tYStr, 10);
        const tM = parseInt(tMStr, 10);
        const mEndDay = clampDay(tY, tM, 31);
        const mStartDate = `${targetMonth}-01`;
        const mEndDate = formatDateIso(tY, tM, mEndDay);

        const genOccs = generateOccurrencesForFlow(
          {
            id: rf.id,
            title: rf.title || 'Fluxo Recorrente',
            type: (rf.type || 'EXPENSE').toUpperCase() as RecurringFlowType,
            nature: (rf.nature || 'CONFIRMED').toUpperCase() as RecurringFlowNature,
            categoryId: rf.categoryId,
            amount,
            amountType: (rf.amountType || 'FIXED').toUpperCase() as RecurringFlowAmountType,
            frequency: freq as RecurringFrequency,
            dayOfMonth: rf.dayOfMonth,
            secondDayOfMonth: rf.secondDayOfMonth,
            startDate: rf.startDate,
            nextDate: rf.nextDate,
            endDate: rf.endDate,
            startMonth: rf.startMonth || referenceMonth,
            endMonth: rf.endMonth,
            totalInstallments: rf.totalInstallments,
            remainingInstallments: rf.remainingInstallments,
            isActive: rf.isActive ?? 1,
            status: (rf.status || 'ACTIVE').toUpperCase() as RecurringFlowStatus,
            destinationAccountId: rf.destinationAccountId,
            incomeCategory: rf.incomeCategory,
            notes: rf.notes,
          },
          mStartDate,
          mEndDate
        );

        for (const gen of genOccs) {
          effectiveAmount = roundCurrency(effectiveAmount + Math.abs(safeNumeric(gen.expectedAmount, 0)));
        }
      }

      if (effectiveAmount <= 0) continue;

      const isIncome = (rf.type || '').toUpperCase() === 'INCOME';
      const isEstimated = (rf.nature || 'CONFIRMED').toUpperCase() === 'ESTIMATED';

      if (isEstimated) {
        if (isIncome) {
          estimatedInflows = roundCurrency(estimatedInflows + effectiveAmount);
        } else {
          estimatedOutflows = roundCurrency(estimatedOutflows + effectiveAmount);
        }
      } else {
        if (isIncome) {
          confirmedRecurringInflows = roundCurrency(confirmedRecurringInflows + effectiveAmount);
        } else {
          confirmedRecurringOutflows = roundCurrency(confirmedRecurringOutflows + effectiveAmount);
        }
      }
    }

    // C. Structured Liability Installments (applicable in future projection steps idx >= 1)
    let liabilityInstallments = 0;
    if (idx >= 1) {
      for (const liab of activeLiabilityTrackers) {
        if (liab.remainingBalance <= 0) continue;
        if (liab.installmentsRemaining !== null && liab.installmentsRemaining <= 0) continue;

        const payment = roundCurrency(Math.min(liab.remainingBalance, liab.monthlyPayment));
        liabilityInstallments = roundCurrency(liabilityInstallments + payment);
        liab.remainingBalance = roundCurrency(liab.remainingBalance - payment);
        if (liab.installmentsRemaining !== null) {
          liab.installmentsRemaining -= 1;
        }
      }
    }

    // D. Prior Unsettled Credit Card Invoice (settled in month 1 if > 0)
    const priorUnsettledCardInvoice = idx === 1 ? priorUnsettledCardDebt : 0;

    // E. Planned Goal Contributions (for future months idx >= 1)
    let goalContributions = 0;
    if (idx >= 1) {
      for (const gt of activeGoalTrackers) {
        if (gt.remainingToTarget <= 0) continue;
        const contrib = roundCurrency(Math.min(gt.remainingToTarget, gt.monthlyContribution));
        goalContributions = roundCurrency(goalContributions + contrib);
        gt.remainingToTarget = roundCurrency(gt.remainingToTarget - contrib);
      }
    }

    const totalConfirmedInflows = idx === 0 ? 0 : confirmedRecurringInflows;
    const totalConfirmedOutflows =
      idx === 0
        ? 0
        : roundCurrency(
            confirmedRecurringOutflows +
              liabilityInstallments +
              priorUnsettledCardInvoice +
              goalContributions
          );
    const confirmedNet = roundCurrency(totalConfirmedInflows - totalConfirmedOutflows);

    const effEstimatedInflows = idx === 0 ? 0 : estimatedInflows;
    const effEstimatedOutflows = idx === 0 ? 0 : estimatedOutflows;
    const estimatedNet = roundCurrency(effEstimatedInflows - effEstimatedOutflows);

    if (idx > 0) {
      runningConfirmedBalance = roundCurrency(runningConfirmedBalance + confirmedNet);
      runningTotalProjectedBalance = roundCurrency(
        runningTotalProjectedBalance + confirmedNet + estimatedNet
      );
    }

    months.push({
      month: targetMonth,
      monthIndex: idx,
      openingLiquidBalance: openingBalance,
      realized,
      confirmed: {
        recurringInflows: idx === 0 ? 0 : confirmedRecurringInflows,
        recurringOutflows: idx === 0 ? 0 : confirmedRecurringOutflows,
        liabilityInstallments,
        priorUnsettledCardInvoice,
        goalContributions,
        totalInflows: totalConfirmedInflows,
        totalOutflows: totalConfirmedOutflows,
        net: confirmedNet,
      },
      estimated: {
        inflows: effEstimatedInflows,
        outflows: effEstimatedOutflows,
        net: estimatedNet,
      },
      closingConfirmedBalance: runningConfirmedBalance,
      closingTotalProjectedBalance: runningTotalProjectedBalance,
      isLiquidityBelowThreshold: runningTotalProjectedBalance < minLiquidityThreshold,
      isNegativeLiquidity: runningTotalProjectedBalance < 0,
    });
  }

  // Build explicit hypotheses list
  const hypotheses: ProjectionHypothesis[] = [
    {
      code: 'NO_AUTOMATIC_HISTORICAL_EXTRAPOLATION',
      category: 'ACCOUNTING_SAFEGUARD',
      description:
        'Médias históricas são exibidas apenas como referência analítica e nunca são extrapoladas automaticamente como garantia de receita ou despesa futura.',
    },
    {
      code: 'TRANSFER_AND_CARD_DEDUPLICATION',
      category: 'ACCOUNTING_SAFEGUARD',
      description:
        'Transferências entre contas próprias (TRANSFER), transações ignoradas (is_ignored) e pagamentos de fatura são excluídos das receitas e despesas operacionais.',
    },
  ];

  if (activeRecurring.some((r) => (r.nature || 'CONFIRMED').toUpperCase() === 'CONFIRMED')) {
    hypotheses.push({
      code: 'CONFIRMED_RECURRING_FLOWS',
      category: 'CONFIRMED_RULE',
      description:
        'Fluxos recorrentes configurados como CONFIRMADOS são projetados nos meses futuros dentro de sua vigência e limite de parcelas.',
    });
  }

  if (activeRecurring.some((r) => (r.nature || 'CONFIRMED').toUpperCase() === 'ESTIMATED')) {
    hypotheses.push({
      code: 'ESTIMATED_RECURRING_FLOWS',
      category: 'ESTIMATED_HYPOTHESIS',
      description:
        'Fluxos recorrentes marcados como ESTIMADOS compõem apenas a faixa projetada estimada, separados do saldo confirmado.',
    });
  }

  if (activeLiabilityTrackers.length > 0) {
    hypotheses.push({
      code: 'STRUCTURED_LIABILITY_AMORTIZATION',
      category: 'CONFIRMED_RULE',
      description:
        'Parcelas mensais de passivos cadastrados são deduzidas até a quitação do saldo devedor ou término das parcelas remanescentes.',
    });
  }

  if (activeGoalTrackers.length > 0) {
    hypotheses.push({
      code: 'PLANNED_GOAL_CONTRIBUTIONS',
      category: 'CONFIRMED_RULE',
      description:
        'Aportes mensais planejados para metas ativas são reservados no fluxo projetado até que o valor-alvo de cada meta seja atingido.',
    });
  }

  let lowestProjectedBalance = initialLiquidBalance;
  let lowestProjectedMonth = referenceMonth;
  for (const m of months) {
    if (m.closingTotalProjectedBalance < lowestProjectedBalance) {
      lowestProjectedBalance = m.closingTotalProjectedBalance;
      lowestProjectedMonth = m.month;
    }
  }

  // 7. Calculate Sprint 7 Indicators & 30/60/90 Days Horizon Summaries
  const flowTypeMap = new Map<string, string>(
    recurringFlows.map((rf) => [rf.id, (rf.type || 'EXPENSE').toUpperCase()])
  );

  const activeRecurringIncome = roundCurrency(
    activeRecurring
      .filter((rf) => (rf.type || '').toUpperCase() === 'INCOME')
      .reduce((sum, rf) => sum + roundCurrency(Math.abs(safeNumeric(rf.amount, 0))), 0)
  );

  const realizedIncomePeriod = months[0]?.realized.inflows ?? 0;

  // Expected income & expenses for the reference period:
  // Evaluated per active flow to ensure flows with and without pre-existing occurrences in referenceMonth are both accounted for.
  const [refYearStr, refMonthStr] = referenceMonth.split('-');
  const refY = parseInt(refYearStr, 10) || 2026;
  const refM = parseInt(refMonthStr, 10) || 10;
  const refMonthStart = `${referenceMonth}-01`;
  const refMonthEnd = formatDateIso(refY, refM, clampDay(refY, refM, 31));

  let expectedIncomePeriod = 0;
  let expectedExpensesPeriod = 0;

  for (const rf of activeRecurring) {
    const fType = (rf.type || 'EXPENSE').toUpperCase();
    const amount = roundCurrency(Math.abs(safeNumeric(rf.amount, 0)));
    if (amount <= 0) continue;

    // Check if flow is valid in referenceMonth
    const startM = rf.startMonth || referenceMonth;
    const endM = rf.endMonth || null;
    if (referenceMonth < startM || (endM && referenceMonth > endM)) continue;
    if ((rf.frequency || 'MONTHLY').toUpperCase() === 'ONCE' && referenceMonth !== startM) continue;

    const occsForRefMonth = occurrences.filter(
      (o) =>
        o.flowId === rf.id &&
        o.expectedDate &&
        o.expectedDate.startsWith(referenceMonth) &&
        o.status !== 'CANCELLED'
    );

    let flowMonthTotal = 0;
    if (occsForRefMonth.length > 0) {
      for (const occ of occsForRefMonth) {
        flowMonthTotal = roundCurrency(flowMonthTotal + Math.abs(safeNumeric(occ.expectedAmount, 0)));
      }
    } else {
      const flowModel = {
        id: rf.id,
        title: rf.title || 'Fluxo Recorrente',
        type: fType as RecurringFlowType,
        nature: (rf.nature || 'CONFIRMED').toUpperCase() as RecurringFlowNature,
        categoryId: rf.categoryId,
        amount,
        amountType: (rf.amountType || 'FIXED').toUpperCase() as RecurringFlowAmountType,
        frequency: (rf.frequency || 'MONTHLY').toUpperCase() as RecurringFrequency,
        dayOfMonth: rf.dayOfMonth,
        secondDayOfMonth: rf.secondDayOfMonth,
        startDate: rf.startDate,
        nextDate: rf.nextDate,
        endDate: rf.endDate,
        startMonth: rf.startMonth || referenceMonth,
        endMonth: rf.endMonth,
        totalInstallments: rf.totalInstallments,
        remainingInstallments: rf.remainingInstallments,
        isActive: rf.isActive ?? 1,
        status: (rf.status || 'ACTIVE').toUpperCase() as RecurringFlowStatus,
        destinationAccountId: rf.destinationAccountId,
        incomeCategory: rf.incomeCategory,
        notes: rf.notes,
      };
      const genOccs = generateOccurrencesForFlow(flowModel, refMonthStart, refMonthEnd);
      for (const gen of genOccs) {
        flowMonthTotal = roundCurrency(flowMonthTotal + Math.abs(safeNumeric(gen.expectedAmount, 0)));
      }
    }

    if (fType === 'INCOME') {
      expectedIncomePeriod = roundCurrency(expectedIncomePeriod + flowMonthTotal);
    } else {
      expectedExpensesPeriod = roundCurrency(expectedExpensesPeriod + flowMonthTotal);
    }
  }

  // Include month liabilities and goal contributions in expected expenses
  const monthLiabilities = activeLiabilityTrackers.reduce(
    (sum, l) => sum + roundCurrency(Math.min(l.remainingBalance, l.monthlyPayment)),
    0
  );
  const monthGoalContribs = activeGoalTrackers.reduce(
    (sum, g) => sum + roundCurrency(Math.min(g.remainingToTarget, g.monthlyContribution)),
    0
  );
  expectedExpensesPeriod = roundCurrency(expectedExpensesPeriod + monthLiabilities + monthGoalContribs);

  // Overdue unreconciled income
  const refDateStr = todayDate || `${referenceMonth}-01`;
  let overdueUnreconciledIncome = 0;
  for (const occ of occurrences) {
    const fType = flowTypeMap.get(occ.flowId) || 'EXPENSE';
    if (fType === 'INCOME') {
      const isPast = occ.expectedDate < refDateStr;
      const isUnreconciled =
        occ.status === 'OVERDUE' || (isPast && occ.status === 'PENDING');
      if (
        isUnreconciled &&
        occ.status !== 'CANCELLED' &&
        occ.status !== 'RECONCILED' &&
        occ.status !== 'MANUALLY_CONFIRMED'
      ) {
        overdueUnreconciledIncome = roundCurrency(
          overdueUnreconciledIncome + Math.abs(safeNumeric(occ.expectedAmount, 0))
        );
      }
    }
  }

  // Future commitment rate: Safe handling of zero income, missing data and invalid values
  let futureCommitmentRatePct = 0;
  if (expectedIncomePeriod > 0) {
    const rawRate = (expectedExpensesPeriod / expectedIncomePeriod) * 100;
    futureCommitmentRatePct = Number.isFinite(rawRate)
      ? roundCurrency(Math.min(1000, Math.max(0, rawRate)))
      : 0;
  } else {
    // When expected income is zero or non-positive: commitment of non-existent income is 0
    // (Never return NaN, Infinity, or a false visual number like 100%)
    futureCommitmentRatePct = 0;
  }

  const varianceExpectationVsRealized = roundCurrency(realizedIncomePeriod - expectedIncomePeriod);

  const indicators: CashFlowProjectionIndicators = {
    realizedIncomePeriod,
    expectedIncomePeriod,
    activeRecurringIncome,
    overdueUnreconciledIncome,
    expectedExpensesPeriod,
    projectedClosingBalance: months[0] ? months[0].closingTotalProjectedBalance : initialLiquidBalance,
    futureCommitmentRatePct,
    varianceExpectationVsRealized,
  };

  // Horizon Summaries: 30, 60, 90 days with deterministic, individually dated events
  const targetDate30 = addDays(refDateStr, 30);
  const targetDate60 = addDays(refDateStr, 60);
  const targetDate90 = addDays(refDateStr, 90);

  // Index explicit occurrences by flowId:expectedDate and track the latest explicit occurrence date per flow
  const occurrencesByKey = new Map<string, RecurringOccurrenceInput>();
  const latestOccDateByFlow = new Map<string, string>();
  for (const occ of occurrences) {
    if (occ.expectedDate) {
      occurrencesByKey.set(`${occ.flowId}:${occ.expectedDate}`, occ);
      const currLatest = latestOccDateByFlow.get(occ.flowId);
      if (!currLatest || occ.expectedDate > currLatest) {
        latestOccDateByFlow.set(occ.flowId, occ.expectedDate);
      }
    }
  }

  // Generate concrete dated occurrences up to targetDate90 for flows without explicit occurrences
  for (const rf of activeRecurring) {
    if (latestOccDateByFlow.has(rf.id)) {
      continue;
    }

    const genStartDate = refDateStr;
    if (genStartDate > targetDate90) {
      continue;
    }

    const flowModel = {
      id: rf.id,
      title: rf.title || 'Fluxo Recorrente',
      type: (rf.type || 'EXPENSE').toUpperCase() as RecurringFlowType,
      nature: (rf.nature || 'CONFIRMED').toUpperCase() as RecurringFlowNature,
      categoryId: rf.categoryId,
      amount: Math.abs(safeNumeric(rf.amount, 0)),
      amountType: (rf.amountType || 'FIXED').toUpperCase() as RecurringFlowAmountType,
      frequency: (rf.frequency || 'MONTHLY').toUpperCase() as RecurringFrequency,
      dayOfMonth: rf.dayOfMonth,
      secondDayOfMonth: rf.secondDayOfMonth,
      startDate: rf.startDate,
      nextDate: rf.nextDate,
      endDate: rf.endDate,
      startMonth: rf.startMonth || referenceMonth,
      endMonth: rf.endMonth,
      totalInstallments: rf.totalInstallments,
      remainingInstallments: rf.remainingInstallments,
      isActive: rf.isActive ?? 1,
      status: (rf.status || 'ACTIVE').toUpperCase() as RecurringFlowStatus,
      destinationAccountId: rf.destinationAccountId,
      incomeCategory: rf.incomeCategory,
      notes: rf.notes,
    };

    const genOccs = generateOccurrencesForFlow(flowModel, genStartDate, targetDate90);
    for (const gen of genOccs) {
      const key = `${gen.flowId}:${gen.expectedDate}`;
      if (!occurrencesByKey.has(key)) {
        occurrencesByKey.set(key, gen);
      }
    }
  }

  // Filter eligible occurrences affecting future cash:
  // - in window [refDateStr, targetDate90]
  // - status !== 'CANCELLED'
  // - status !== 'RECONCILED' && !transactionId
  // - expectedDate >= refDateStr (overdue past occurrences do NOT turn into available balance)
  const allEligibleOccurrences = Array.from(occurrencesByKey.values()).filter((occ) => {
    if (!occ.expectedDate || occ.expectedDate < refDateStr || occ.expectedDate > targetDate90) {
      return false;
    }
    if (occ.status === 'CANCELLED') return false;
    if (occ.status === 'RECONCILED' || Boolean(occ.transactionId)) return false;
    return true;
  });

  function calculateHorizonSummary(days: number, targetDate: string): CashFlowHorizonSummary {
    const dayChanges = new Map<string, { inflow: number; outflow: number }>();

    let projectedInflows = 0;
    let projectedOutflows = 0;

    for (const occ of allEligibleOccurrences) {
      if (occ.expectedDate > targetDate) continue;
      const fType = flowTypeMap.get(occ.flowId) || 'EXPENSE';
      const amount = roundCurrency(Math.abs(safeNumeric(occ.expectedAmount, 0)));
      if (amount <= 0) continue;

      const day = dayChanges.get(occ.expectedDate) || { inflow: 0, outflow: 0 };
      if (fType === 'INCOME') {
        day.inflow = roundCurrency(day.inflow + amount);
        projectedInflows = roundCurrency(projectedInflows + amount);
      } else {
        day.outflow = roundCurrency(day.outflow + amount);
        projectedOutflows = roundCurrency(projectedOutflows + amount);
      }
      dayChanges.set(occ.expectedDate, day);
    }

    // Include structured liabilities in horizon
    const monthsInHorizon = Math.ceil(days / 30);
    for (let mIdx = 1; mIdx <= monthsInHorizon; mIdx++) {
      const mStr = addMonths(referenceMonth, mIdx);
      const liabDate = `${mStr}-10`;
      if (liabDate >= refDateStr && liabDate <= targetDate) {
        for (const liab of activeLiabilityTrackers) {
          if (liab.remainingBalance <= 0) continue;
          if (liab.installmentsRemaining !== null && liab.installmentsRemaining <= 0) continue;
          const pmt = roundCurrency(Math.min(liab.remainingBalance, liab.monthlyPayment));
          if (pmt > 0) {
            projectedOutflows = roundCurrency(projectedOutflows + pmt);
            const day = dayChanges.get(liabDate) || { inflow: 0, outflow: 0 };
            day.outflow = roundCurrency(day.outflow + pmt);
            dayChanges.set(liabDate, day);
          }
        }
      }

      if (mIdx === 1 && priorUnsettledCardDebt > 0) {
        const cardDate = `${mStr}-10`;
        if (cardDate >= refDateStr && cardDate <= targetDate) {
          projectedOutflows = roundCurrency(projectedOutflows + priorUnsettledCardDebt);
          const day = dayChanges.get(cardDate) || { inflow: 0, outflow: 0 };
          day.outflow = roundCurrency(day.outflow + priorUnsettledCardDebt);
          dayChanges.set(cardDate, day);
        }
      }

      const goalDate = `${mStr}-01`;
      if (goalDate >= refDateStr && goalDate <= targetDate) {
        for (const gt of activeGoalTrackers) {
          if (gt.remainingToTarget <= 0) continue;
          const contrib = roundCurrency(Math.min(gt.remainingToTarget, gt.monthlyContribution));
          if (contrib > 0) {
            projectedOutflows = roundCurrency(projectedOutflows + contrib);
            const day = dayChanges.get(goalDate) || { inflow: 0, outflow: 0 };
            day.outflow = roundCurrency(day.outflow + contrib);
            dayChanges.set(goalDate, day);
          }
        }
      }
    }

    const projectedNet = roundCurrency(projectedInflows - projectedOutflows);
    const projectedClosingBalance = roundCurrency(initialLiquidBalance + projectedNet);

    // Timeline analysis: Calculate running balance day-by-day to find minimum balance and its exact date
    const sortedDates = Array.from(dayChanges.keys()).sort();
    let runningBalance = initialLiquidBalance;
    let lowestBalance = initialLiquidBalance;
    let lowestDate = refDateStr;

    for (const dStr of sortedDates) {
      const day = dayChanges.get(dStr)!;
      runningBalance = roundCurrency(runningBalance + day.inflow - day.outflow);
      if (runningBalance < lowestBalance) {
        lowestBalance = runningBalance;
        lowestDate = dStr;
      }
    }

    return {
      days,
      targetDate,
      projectedInflows,
      projectedOutflows,
      projectedNet,
      projectedClosingBalance,
      lowestProjectedBalance: lowestBalance,
      lowestProjectedDate: lowestDate,
      isNegativeLiquidity: lowestBalance < 0 || projectedClosingBalance < 0,
    };
  }

  const horizonSummaries = {
    days30: calculateHorizonSummary(30, targetDate30),
    days60: calculateHorizonSummary(60, targetDate60),
    days90: calculateHorizonSummary(90, targetDate90),
  };

  return {
    referenceMonth,
    horizonMonths,
    initialLiquidBalance,
    priorUnsettledCardDebt,
    historicalContext: {
      analyzedMonths: distinctMonths,
      averageMonthlyIncome,
      averageMonthlyExpenses,
      note: 'Valores históricos médios servem apenas para contexto e não garantem receitas ou despesas futuras.',
    },
    hypotheses,
    months,
    lowestProjectedBalance,
    lowestProjectedMonth,
    indicators,
    horizonSummaries,
  };
}

// ============================================================================
// 6. DETERMINISTIC SAVINGS & FINANCIAL INDEPENDENCE SIMULATOR
// ============================================================================

export interface SavingsSimulationInput {
  initialCapital: number;
  monthlyContribution: number;
  horizonMonths: number;
  annualNominalReturnPct: number; // e.g., 10.0 for 10% a.a.
  annualInflationPct?: number; // e.g., 4.5 for 4.5% a.a.
  desiredMonthlyIncome?: number; // Real purchasing power desired per month
  safeWithdrawalRatePct?: number; // e.g., 4.0% a.a.
}

export interface SimulationTimelinePoint {
  month: number;
  year: number;
  totalContributedReal: number;
  nominalBalance: number;
  realBalancePurchasingPower: number; // Contributions & returns in constant purchasing power (Fisher real rate)
  deflatedFixedNominalBalance: number; // Nominal balance deflated if contributions are not inflation-adjusted
  realYieldAccumulated: number;
}

export interface ScenarioVariantSummary {
  id: 'CONSERVATIVE' | 'BASE' | 'OPTIMISTIC';
  label: string;
  annualNominalReturnPct: number;
  annualRealReturnPct: number;
  finalNominalBalance: number;
  finalRealBalance: number;
  totalContributed: number;
  totalRealYield: number;
}

export interface WithdrawalSensitivityRow {
  annualWithdrawalRatePct: number;
  requiredCapitalReal: number;
  projectedSustainableMonthlyIncomeReal: number;
  reachesDesiredIncomeInHorizon: boolean;
}

export interface SavingsSimulationResult {
  isValid: boolean;
  validationErrors: string[];
  inputs: {
    initialCapital: number;
    monthlyContribution: number;
    horizonMonths: number;
    horizonYears: number;
    annualNominalReturnPct: number;
    annualInflationPct: number;
    desiredMonthlyIncome: number;
    safeWithdrawalRatePct: number;
  };
  rates: {
    annualRealReturnPct: number;
    monthlyNominalRatePct: number;
    monthlyInflationRatePct: number;
    monthlyRealRatePct: number;
  };
  baseResult: {
    totalContributed: number;
    finalNominalBalance: number;
    totalNominalYield: number;
    finalRealBalance: number; // Purchasing power with inflation-indexed contributions
    totalRealYield: number;
    finalDeflatedFixedNominalBalance: number; // Purchasing power if contributions stay nominally flat
  };
  timeline: SimulationTimelinePoint[];
  scenarios: ScenarioVariantSummary[];
  contributionSensitivity: Array<{
    deltaLabel: string;
    monthlyContribution: number;
    finalRealBalance: number;
    differenceFromBaseReal: number;
  }>;
  financialIndependence: {
    desiredMonthlyIncomeReal: number;
    configuredWithdrawalRatePct: number;
    requiredCapitalAtConfiguredRate: number;
    projectedSustainableMonthlyIncomeReal: number;
    capitalCoveragePct: number;
    monthsToReachFI: number | null;
    withdrawalSensitivity: WithdrawalSensitivityRow[];
  };
  methodologyAndLimitations: {
    valueBasisNotice: string;
    formulasUsed: string[];
    temporalConvention: string;
    inflationTreatment: string;
    limitationsAndRisks: string[];
  };
}

export function simulateSavingsScenarios(rawInput: SavingsSimulationInput): SavingsSimulationResult {
  const validationErrors: string[] = [];

  const initialCapital = safeNumeric(rawInput.initialCapital, NaN);
  const monthlyContribution = safeNumeric(rawInput.monthlyContribution, NaN);
  const horizonMonths = Math.round(safeNumeric(rawInput.horizonMonths, NaN));
  const annualNominalReturnPct = safeNumeric(rawInput.annualNominalReturnPct, NaN);
  const annualInflationPct = safeNumeric(rawInput.annualInflationPct ?? 4.5, NaN);
  const desiredMonthlyIncome = safeNumeric(rawInput.desiredMonthlyIncome ?? 0, 0);
  const safeWithdrawalRatePct = safeNumeric(rawInput.safeWithdrawalRatePct ?? 4.0, 4.0);

  if (Number.isNaN(initialCapital) || initialCapital < 0) {
    validationErrors.push('O capital inicial deve ser um número maior ou igual a zero.');
  }
  if (Number.isNaN(monthlyContribution) || monthlyContribution < 0) {
    validationErrors.push('A contribuição periódica mensal deve ser maior ou igual a zero.');
  }
  if (Number.isNaN(horizonMonths) || horizonMonths < 1 || horizonMonths > 720) {
    validationErrors.push('O horizonte temporal deve estar entre 1 e 720 meses (60 anos).');
  }
  if (
    Number.isNaN(annualNominalReturnPct) ||
    annualNominalReturnPct < -50 ||
    annualNominalReturnPct > 100
  ) {
    validationErrors.push('A taxa de retorno anual hipotética deve estar entre -50% e 100% a.a.');
  }
  if (Number.isNaN(annualInflationPct) || annualInflationPct < -20 || annualInflationPct > 100) {
    validationErrors.push('A inflação anual hipotética deve estar entre -20% e 100% a.a.');
  }
  if (desiredMonthlyIncome < 0) {
    validationErrors.push('A renda mensal desejada não pode ser negativa.');
  }
  if (safeWithdrawalRatePct <= 0 || safeWithdrawalRatePct > 25) {
    validationErrors.push('A taxa de retirada anual hipotética deve estar entre 0,1% e 25% a.a.');
  }

  if (validationErrors.length > 0) {
    return {
      isValid: false,
      validationErrors,
      inputs: {
        initialCapital: Math.max(0, initialCapital || 0),
        monthlyContribution: Math.max(0, monthlyContribution || 0),
        horizonMonths: Math.max(1, horizonMonths || 12),
        horizonYears: roundCurrency(Math.max(1, horizonMonths || 12) / 12),
        annualNominalReturnPct: annualNominalReturnPct || 0,
        annualInflationPct: annualInflationPct || 0,
        desiredMonthlyIncome: Math.max(0, desiredMonthlyIncome || 0),
        safeWithdrawalRatePct: safeWithdrawalRatePct || 4,
      },
      rates: {
        annualRealReturnPct: 0,
        monthlyNominalRatePct: 0,
        monthlyInflationRatePct: 0,
        monthlyRealRatePct: 0,
      },
      baseResult: {
        totalContributed: 0,
        finalNominalBalance: 0,
        totalNominalYield: 0,
        finalRealBalance: 0,
        totalRealYield: 0,
        finalDeflatedFixedNominalBalance: 0,
      },
      timeline: [],
      scenarios: [],
      contributionSensitivity: [],
      financialIndependence: {
        desiredMonthlyIncomeReal: 0,
        configuredWithdrawalRatePct: 4,
        requiredCapitalAtConfiguredRate: 0,
        projectedSustainableMonthlyIncomeReal: 0,
        capitalCoveragePct: 0,
        monthsToReachFI: null,
        withdrawalSensitivity: [],
      },
      methodologyAndLimitations: {
        valueBasisNotice: 'Hipóteses inválidas fornecidas.',
        formulasUsed: [],
        temporalConvention: '',
        inflationTreatment: '',
        limitationsAndRisks: validationErrors,
      },
    };
  }

  // Exact Compound Rates (Fisher Equation & Geometric Monthly Equivalences)
  const rNomAnnual = annualNominalReturnPct / 100;
  const iInfAnnual = annualInflationPct / 100;
  const rRealAnnual = (1 + rNomAnnual) / (1 + iInfAnnual) - 1;

  const rNomMonthly = Math.pow(1 + rNomAnnual, 1 / 12) - 1;
  const iInfMonthly = Math.pow(1 + iInfAnnual, 1 / 12) - 1;
  const rRealMonthly = Math.pow(1 + rRealAnnual, 1 / 12) - 1;

  // Helper to run trajectory for given annual nominal return & monthly contribution
  const computeTrajectory = (nomReturnPct: number, mContrib: number) => {
    const rNomA = nomReturnPct / 100;
    const rRealA = (1 + rNomA) / (1 + iInfAnnual) - 1;
    const rNomM = Math.pow(1 + rNomA, 1 / 12) - 1;
    const rRealM = Math.pow(1 + rRealA, 1 / 12) - 1;

    let nomBal = initialCapital;
    let realBal = initialCapital;
    let totalContributed = initialCapital;
    const pts: SimulationTimelinePoint[] = [
      {
        month: 0,
        year: 0,
        totalContributedReal: roundCurrency(initialCapital),
        nominalBalance: roundCurrency(initialCapital),
        realBalancePurchasingPower: roundCurrency(initialCapital),
        deflatedFixedNominalBalance: roundCurrency(initialCapital),
        realYieldAccumulated: 0,
      },
    ];

    for (let m = 1; m <= horizonMonths; m++) {
      nomBal = nomBal * (1 + rNomM) + mContrib;
      realBal = realBal * (1 + rRealM) + mContrib;
      totalContributed += mContrib;
      const inflationFactor = Math.pow(1 + iInfMonthly, m);
      const deflatedFixed = nomBal / inflationFactor;

      pts.push({
        month: m,
        year: roundCurrency(m / 12),
        totalContributedReal: roundCurrency(totalContributed),
        nominalBalance: roundCurrency(nomBal),
        realBalancePurchasingPower: roundCurrency(realBal),
        deflatedFixedNominalBalance: roundCurrency(deflatedFixed),
        realYieldAccumulated: roundCurrency(realBal - totalContributed),
      });
    }

    const last = pts[pts.length - 1];
    return {
      annualRealReturnPct: roundCurrency(rRealA * 100),
      totalContributed: last.totalContributedReal,
      finalNominalBalance: last.nominalBalance,
      totalNominalYield: roundCurrency(last.nominalBalance - last.totalContributedReal),
      finalRealBalance: last.realBalancePurchasingPower,
      totalRealYield: last.realYieldAccumulated,
      finalDeflatedFixedNominalBalance: last.deflatedFixedNominalBalance,
      points: pts,
    };
  };

  const baseSim = computeTrajectory(annualNominalReturnPct, monthlyContribution);
  const consNominal = Math.max(-50, annualNominalReturnPct - 2);
  const optNominal = Math.min(100, annualNominalReturnPct + 2);
  const consSim = computeTrajectory(consNominal, monthlyContribution);
  const optSim = computeTrajectory(optNominal, monthlyContribution);

  const scenarios: ScenarioVariantSummary[] = [
    {
      id: 'CONSERVATIVE',
      label: 'Cenário Conservador (-2% a.a.)',
      annualNominalReturnPct: roundCurrency(consNominal),
      annualRealReturnPct: consSim.annualRealReturnPct,
      finalNominalBalance: consSim.finalNominalBalance,
      finalRealBalance: consSim.finalRealBalance,
      totalContributed: consSim.totalContributed,
      totalRealYield: consSim.totalRealYield,
    },
    {
      id: 'BASE',
      label: 'Cenário Base (Configurado)',
      annualNominalReturnPct: roundCurrency(annualNominalReturnPct),
      annualRealReturnPct: baseSim.annualRealReturnPct,
      finalNominalBalance: baseSim.finalNominalBalance,
      finalRealBalance: baseSim.finalRealBalance,
      totalContributed: baseSim.totalContributed,
      totalRealYield: baseSim.totalRealYield,
    },
    {
      id: 'OPTIMISTIC',
      label: 'Cenário Otimista (+2% a.a.)',
      annualNominalReturnPct: roundCurrency(optNominal),
      annualRealReturnPct: optSim.annualRealReturnPct,
      finalNominalBalance: optSim.finalNominalBalance,
      finalRealBalance: optSim.finalRealBalance,
      totalContributed: optSim.totalContributed,
      totalRealYield: optSim.totalRealYield,
    },
  ];

  // Contribution Sensitivity (-20%, Base, +20%)
  const contribLow = roundCurrency(monthlyContribution * 0.8);
  const contribHigh = roundCurrency(monthlyContribution * 1.2);
  const simLow = computeTrajectory(annualNominalReturnPct, contribLow);
  const simHigh = computeTrajectory(annualNominalReturnPct, contribHigh);

  const contributionSensitivity = [
    {
      deltaLabel: '-20% no Aporte Mensal',
      monthlyContribution: contribLow,
      finalRealBalance: simLow.finalRealBalance,
      differenceFromBaseReal: roundCurrency(simLow.finalRealBalance - baseSim.finalRealBalance),
    },
    {
      deltaLabel: 'Aporte Base Configurado',
      monthlyContribution: roundCurrency(monthlyContribution),
      finalRealBalance: baseSim.finalRealBalance,
      differenceFromBaseReal: 0,
    },
    {
      deltaLabel: '+20% no Aporte Mensal',
      monthlyContribution: contribHigh,
      finalRealBalance: simHigh.finalRealBalance,
      differenceFromBaseReal: roundCurrency(simHigh.finalRealBalance - baseSim.finalRealBalance),
    },
  ];

  // Financial Independence Sensitivity
  const swrFraction = safeWithdrawalRatePct / 100;
  const requiredCapitalAtConfiguredRate =
    desiredMonthlyIncome > 0 ? roundCurrency((desiredMonthlyIncome * 12) / swrFraction) : 0;
  const projectedSustainableMonthlyIncomeReal = roundCurrency(
    (baseSim.finalRealBalance * swrFraction) / 12
  );
  const capitalCoveragePct =
    requiredCapitalAtConfiguredRate > 0
      ? roundCurrency((baseSim.finalRealBalance / requiredCapitalAtConfiguredRate) * 100)
      : 100;

  let monthsToReachFI: number | null = null;
  if (requiredCapitalAtConfiguredRate > 0) {
    const foundPoint = baseSim.points.find(
      (p) => p.realBalancePurchasingPower >= requiredCapitalAtConfiguredRate
    );
    if (foundPoint) {
      monthsToReachFI = foundPoint.month;
    }
  }

  const candidateRates = Array.from(
    new Set([3.0, 3.5, 4.0, 4.5, roundCurrency(safeWithdrawalRatePct)])
  ).sort((a, b) => a - b);

  const withdrawalSensitivity: WithdrawalSensitivityRow[] = candidateRates.map((ratePct) => {
    const reqCap =
      desiredMonthlyIncome > 0 ? roundCurrency((desiredMonthlyIncome * 12) / (ratePct / 100)) : 0;
    const sustMonthly = roundCurrency((baseSim.finalRealBalance * (ratePct / 100)) / 12);
    return {
      annualWithdrawalRatePct: ratePct,
      requiredCapitalReal: reqCap,
      projectedSustainableMonthlyIncomeReal: sustMonthly,
      reachesDesiredIncomeInHorizon:
        desiredMonthlyIncome > 0 ? sustMonthly >= desiredMonthlyIncome : true,
    };
  });

  return {
    isValid: true,
    validationErrors: [],
    inputs: {
      initialCapital: roundCurrency(initialCapital),
      monthlyContribution: roundCurrency(monthlyContribution),
      horizonMonths,
      horizonYears: roundCurrency(horizonMonths / 12),
      annualNominalReturnPct: roundCurrency(annualNominalReturnPct),
      annualInflationPct: roundCurrency(annualInflationPct),
      desiredMonthlyIncome: roundCurrency(desiredMonthlyIncome),
      safeWithdrawalRatePct: roundCurrency(safeWithdrawalRatePct),
    },
    rates: {
      annualRealReturnPct: roundCurrency(rRealAnnual * 100),
      monthlyNominalRatePct: roundCurrency(rNomMonthly * 100),
      monthlyInflationRatePct: roundCurrency(iInfMonthly * 100),
      monthlyRealRatePct: roundCurrency(rRealMonthly * 100),
    },
    baseResult: {
      totalContributed: baseSim.totalContributed,
      finalNominalBalance: baseSim.finalNominalBalance,
      totalNominalYield: baseSim.totalNominalYield,
      finalRealBalance: baseSim.finalRealBalance,
      totalRealYield: baseSim.totalRealYield,
      finalDeflatedFixedNominalBalance: baseSim.finalDeflatedFixedNominalBalance,
    },
    timeline: baseSim.points,
    scenarios,
    contributionSensitivity,
    financialIndependence: {
      desiredMonthlyIncomeReal: roundCurrency(desiredMonthlyIncome),
      configuredWithdrawalRatePct: roundCurrency(safeWithdrawalRatePct),
      requiredCapitalAtConfiguredRate,
      projectedSustainableMonthlyIncomeReal,
      capitalCoveragePct,
      monthsToReachFI,
      withdrawalSensitivity,
    },
    methodologyAndLimitations: {
      valueBasisNotice:
        'Resultados apresentados explicitamente em Valores Nominais (sem desconto inflacionário) e em Valores Reais (poder de compra de hoje descontando a inflação pela Equação de Fisher).',
      formulasUsed: [
        'Equação de Fisher para taxa real anual: (1 + r_real) = (1 + r_nominal) / (1 + i_inflacao)',
        'Equivalência composta mensal: r_mensal = (1 + r_anual)^(1/12) - 1',
        'Evolução recursiva postecipada: Saldo(t) = Saldo(t-1) * (1 + r_mensal) + Aporte',
        'Capital alvo de referência p/ renda: Capital_Alvo = (Renda_Mensal_Desejada * 12) / Taxa_Retirada_Anual',
      ],
      temporalConvention:
        'Capitalização composta mensal com aportes postecipados (ao final de cada mês) e horizonte expresso em meses inteiros.',
      inflationTreatment:
        'O Saldo Real assume que os aportes mensais acompanham a inflação para preservar seu poder de compra real. Também é exposto o Saldo Nominal Deflacionado caso os aportes permaneçam nominalmente fixos.',
      limitationsAndRisks: [
        'Cenários hipotéticos determinísticos não constituem garantia nem recomendação de investimento.',
        'Retornos reais do mercado financeiro apresentam volatilidade e risco de sequência de retornos (sequence-of-returns risk), não sendo lineares mês a mês.',
        'Nenhuma taxa anual de retirada (ex: 4% a.a.) é garantia universal de perpetuidade patrimonial; impostos, custos de transação e choques inflacionários afetam a sustentabilidade.',
      ],
    },
  };
}

// ============================================================================
// 7. DETERMINISTIC LIQUIDITY & COMMITMENT ALERTS ENGINE
// ============================================================================

export type PlanningAlertType =
  | 'LOW_PROJECTED_LIQUIDITY'
  | 'BUDGET_NEAR_LIMIT'
  | 'BUDGET_EXCEEDED'
  | 'GOAL_AT_RISK'
  | 'GOAL_OVERALLOCATION'
  | 'LIABILITY_DUE_SOON'
  | 'STALE_FINANCIAL_DATA';

export type PlanningAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface DeterministicPlanningAlert {
  fingerprint: string; // Deterministic deduplication key: type:entity:period
  type: PlanningAlertType;
  severity: PlanningAlertSeverity;
  title: string;
  reason: string;
  period: string;
  foundationData: Record<string, unknown>;
}

export function evaluatePlanningAlerts(params: {
  referenceMonth: string;
  referenceDateISO?: string; // YYYY-MM-DD
  budgetSummary: BudgetExecutionSummary;
  goalsSummary: GoalsEvaluationSummary;
  cashFlowProjection: CashFlowProjectionResult;
  accounts: PlanningAccountInput[];
  liabilities: PlanningLiabilityInput[];
  preferences?: AlertPreferencesInput;
}): DeterministicPlanningAlert[] {
  const {
    referenceMonth,
    budgetSummary,
    goalsSummary,
    cashFlowProjection,
    accounts,
    liabilities,
  } = params;

  const refDateStr = params.referenceDateISO || new Date().toISOString().split('T')[0];
  const refTimeMs = new Date(`${refDateStr}T12:00:00Z`).getTime();

  const minLiquidityThreshold = params.preferences?.minLiquidityThreshold ?? 1000;
  const warningPct = params.preferences?.budgetWarningPct ?? 80;
  const criticalPct = params.preferences?.budgetCriticalPct ?? 100;
  const maxStalenessDays = params.preferences?.maxDataStalenessDays ?? 7;
  const dueSoonDays = params.preferences?.liabilityDueSoonDays ?? 7;

  const alerts: DeterministicPlanningAlert[] = [];
  const seenFingerprints = new Set<string>();

  const pushUniqueAlert = (alert: DeterministicPlanningAlert) => {
    if (seenFingerprints.has(alert.fingerprint)) return;
    seenFingerprints.add(alert.fingerprint);
    alerts.push(alert);
  };

  // 1. Projected Liquidity Below Threshold
  for (const m of cashFlowProjection.months) {
    if (m.closingTotalProjectedBalance < minLiquidityThreshold) {
      const isNegative = m.closingTotalProjectedBalance < 0;
      pushUniqueAlert({
        fingerprint: `LOW_PROJECTED_LIQUIDITY:cashflow:${m.month}`,
        type: 'LOW_PROJECTED_LIQUIDITY',
        severity: isNegative ? 'CRITICAL' : 'WARNING',
        title: isNegative
          ? `Déficit de liquidez projetado em ${m.month}`
          : `Saldo projetado abaixo do limite mínimo em ${m.month}`,
        reason: isNegative
          ? `O saldo de caixa projetado para ${m.month} atinge R$ ${m.closingTotalProjectedBalance.toFixed(2)}, ficando negativo frente aos compromissos programados e estimados.`
          : `O saldo projetado para ${m.month} (R$ ${m.closingTotalProjectedBalance.toFixed(2)}) fica abaixo do colchão mínimo configurado de R$ ${minLiquidityThreshold.toFixed(2)}.`,
        period: m.month,
        foundationData: {
          month: m.month,
          openingBalance: m.openingLiquidBalance,
          confirmedNet: m.confirmed.net,
          estimatedNet: m.estimated.net,
          projectedBalance: m.closingTotalProjectedBalance,
          threshold: minLiquidityThreshold,
        },
      });
      // Report the earliest liquidity breach to avoid flooding every subsequent month
      break;
    }
  }

  // 2. Category Budget Exceeded or Near Limit
  for (const item of budgetSummary.items) {
    if (item.status !== 'ACTIVE' || item.plannedAmount <= 0) continue;

    if (item.executionPct > criticalPct) {
      pushUniqueAlert({
        fingerprint: `BUDGET_EXCEEDED:${item.categoryId}:${referenceMonth}`,
        type: 'BUDGET_EXCEEDED',
        severity: 'CRITICAL',
        title: `Orçamento ultrapassado: ${item.budgetName}`,
        reason: `A categoria "${item.budgetName}" registrou gasto realizado de R$ ${item.realizedSpent.toFixed(2)} (${item.executionPct}% do limite planejado de R$ ${item.plannedAmount.toFixed(2)}) no período ${referenceMonth}.`,
        period: referenceMonth,
        foundationData: {
          categoryId: item.categoryId,
          categoryName: item.budgetName,
          plannedAmount: item.plannedAmount,
          realizedSpent: item.realizedSpent,
          executionPct: item.executionPct,
          criticalThresholdPct: criticalPct,
        },
      });
    } else if (item.executionPct >= warningPct) {
      pushUniqueAlert({
        fingerprint: `BUDGET_NEAR_LIMIT:${item.categoryId}:${referenceMonth}`,
        type: 'BUDGET_NEAR_LIMIT',
        severity: 'WARNING',
        title: `Orçamento próximo do limite: ${item.budgetName}`,
        reason: `A categoria "${item.budgetName}" atingiu ${item.executionPct}% do teto planejado (R$ ${item.realizedSpent.toFixed(2)} de R$ ${item.plannedAmount.toFixed(2)}) em ${referenceMonth}.`,
        period: referenceMonth,
        foundationData: {
          categoryId: item.categoryId,
          categoryName: item.budgetName,
          plannedAmount: item.plannedAmount,
          realizedSpent: item.realizedSpent,
          remainingBalance: item.remainingBalance,
          executionPct: item.executionPct,
          warningThresholdPct: warningPct,
        },
      });
    }
  }

  // 3. Goals At Risk or Over-Allocated Reserves
  if (goalsSummary.isReserveOverAllocated) {
    pushUniqueAlert({
      fingerprint: `GOAL_OVERALLOCATION:global:${referenceMonth}`,
      type: 'GOAL_OVERALLOCATION',
      severity: 'WARNING',
      title: 'Saldo acumulado nas metas excede a liquidez real disponível',
      reason: `A soma dos valores acumulados declarados nas metas ativas (R$ ${goalsSummary.totalDeclaredCurrentAmount.toFixed(2)}) supera a reserva líquida e investida verificada nas contas (R$ ${goalsSummary.verifiedAvailableReserve.toFixed(2)}), gerando R$ ${goalsSummary.totalUnbackedGoalAmount.toFixed(2)} sem lastro exclusivo.`,
      period: referenceMonth,
      foundationData: {
        totalDeclaredCurrentAmount: goalsSummary.totalDeclaredCurrentAmount,
        verifiedAvailableReserve: goalsSummary.verifiedAvailableReserve,
        unbackedGoalAmount: goalsSummary.totalUnbackedGoalAmount,
      },
    });
  }

  for (const goal of goalsSummary.goals) {
    if (goal.status !== 'ACTIVE') continue;

    if (goal.feasibility === 'OVERDUE' || goal.feasibility === 'AT_RISK') {
      const isOverdue = goal.feasibility === 'OVERDUE';
      pushUniqueAlert({
        fingerprint: `GOAL_AT_RISK:${goal.id}:${referenceMonth}`,
        type: 'GOAL_AT_RISK',
        severity: isOverdue ? 'CRITICAL' : 'WARNING',
        title: isOverdue
          ? `Meta com prazo vencido: ${goal.title}`
          : `Meta em risco de atraso: ${goal.title}`,
        reason: isOverdue
          ? `A meta "${goal.title}" possui prazo-alvo em ${goal.deadline} e ainda restam R$ ${goal.remainingAmount.toFixed(2)} para atingir R$ ${goal.targetAmount.toFixed(2)}.`
          : `Para atingir R$ ${goal.targetAmount.toFixed(2)} até ${goal.deadline}, a meta "${goal.title}" requer aporte mensal de R$ ${(goal.requiredMonthlyContribution || 0).toFixed(2)}, mas o aporte planejado atual é de R$ ${goal.plannedMonthlyContribution.toFixed(2)}.`,
        period: referenceMonth,
        foundationData: {
          goalId: goal.id,
          title: goal.title,
          targetAmount: goal.targetAmount,
          currentAmount: goal.declaredCurrentAmount,
          remainingAmount: goal.remainingAmount,
          deadline: goal.deadline,
          plannedMonthlyContribution: goal.plannedMonthlyContribution,
          requiredMonthlyContribution: goal.requiredMonthlyContribution,
          monthsRemaining: goal.monthsRemaining,
        },
      });
    }
  }

  // 4. Financial Obligations / Liabilities Due Soon
  for (const liab of liabilities) {
    const balance = roundCurrency(safeNumeric(liab.currentBalance, 0));
    if (balance <= 0 || !liab.dueDate) continue;

    const dueTimeMs = new Date(`${liab.dueDate.slice(0, 10)}T12:00:00Z`).getTime();
    if (Number.isNaN(dueTimeMs)) continue;

    const diffDays = Math.round((dueTimeMs - refTimeMs) / (1000 * 60 * 60 * 24));
    if (diffDays <= dueSoonDays) {
      const isOverdue = diffDays < 0;
      pushUniqueAlert({
        fingerprint: `LIABILITY_DUE_SOON:${liab.id}:${liab.dueDate.slice(0, 10)}`,
        type: 'LIABILITY_DUE_SOON',
        severity: isOverdue ? 'CRITICAL' : 'WARNING',
        title: isOverdue
          ? `Obrigação financeira vencida: ${liab.name}`
          : `Obrigação financeira próxima do vencimento: ${liab.name}`,
        reason: isOverdue
          ? `O compromisso "${liab.name}" (saldo de R$ ${balance.toFixed(2)}) teve vencimento em ${liab.dueDate.slice(0, 10)} (${Math.abs(diffDays)} dia(s) atrás).`
          : `O compromisso "${liab.name}" (saldo de R$ ${balance.toFixed(2)}) vence em ${liab.dueDate.slice(0, 10)} (em ${diffDays} dia(s)).`,
        period: referenceMonth,
        foundationData: {
          liabilityId: liab.id,
          name: liab.name,
          currentBalance: balance,
          monthlyPayment: safeNumeric(liab.monthlyPayment, 0),
          dueDate: liab.dueDate.slice(0, 10),
          daysUntilDue: diffDays,
        },
      });
    }
  }

  // 5. Stale Financial Data Check
  if (accounts.length === 0) {
    pushUniqueAlert({
      fingerprint: `STALE_FINANCIAL_DATA:no_accounts:${referenceMonth}`,
      type: 'STALE_FINANCIAL_DATA',
      severity: 'INFO',
      title: 'Nenhuma conta bancária sincronizada',
      reason:
        'Não há contas bancárias ativas registradas para fundamentar o saldo inicial das projeções de liquidez.',
      period: referenceMonth,
      foundationData: {
        accountsCount: 0,
      },
    });
  } else {
    let oldestDays = 0;
    let staleAccountName = '';
    for (const acc of accounts) {
      if (!acc.updatedAt) continue;
      const updMs = new Date(acc.updatedAt).getTime();
      if (Number.isNaN(updMs)) continue;
      const ageDays = Math.floor((refTimeMs - updMs) / (1000 * 60 * 60 * 24));
      if (ageDays > maxStalenessDays && ageDays > oldestDays) {
        oldestDays = ageDays;
        staleAccountName = acc.name;
      }
    }

    if (oldestDays > maxStalenessDays) {
      pushUniqueAlert({
        fingerprint: `STALE_FINANCIAL_DATA:accounts:${referenceMonth}`,
        type: 'STALE_FINANCIAL_DATA',
        severity: 'WARNING',
        title: 'Dados bancários desatualizados para projeção',
        reason: `A conta "${staleAccountName}" não é atualizada há ${oldestDays} dias (limite recomendado: ${maxStalenessDays} dias), o que pode comprometer a precisão das projeções de liquidez.`,
        period: referenceMonth,
        foundationData: {
          staleAccountName,
          daysSinceLastUpdate: oldestDays,
          maxAllowedDays: maxStalenessDays,
          referenceDate: refDateStr,
        },
      });
    }
  }

  return alerts;
}

// ============================================================================
// 8. CONSULTATIVE AI PAYLOAD PREPARER (FOR FUTURE GEMINI INTEGRATION)
// ============================================================================

export interface ConsultativePlanningSnapshot {
  period: string;
  budgetSummary: {
    totalPlanned: number;
    totalSpent: number;
    executionPct: number;
    overBudgetCategories: Array<{ name: string; planned: number; spent: number; pct: number }>;
  };
  goalsSummary: {
    activeCount: number;
    atRiskCount: number;
    isOverAllocated: boolean;
    totalPlannedContributions: number;
  };
  cashFlowSummary: {
    initialLiquidBalance: number;
    lowestProjectedBalance: number;
    lowestProjectedMonth: string;
    horizonMonths: number;
    projected30DaysBalance?: number;
    projected60DaysBalance?: number;
    projected90DaysBalance?: number;
    expectedIncomePeriod?: number;
    realizedIncomePeriod?: number;
    varianceExpectationVsRealized?: number;
    overdueUnreconciledIncome?: number;
  };
  activeAlertsCount: number;
}

/**
 * Prepares a sanitized, credential-free, read-only consultative payload
 * for future AI interpretation without exposing raw bank credentials or allowing AI mutations.
 */
export function buildConsultativePlanningSnapshot(params: {
  referenceMonth: string;
  budgetSummary: BudgetExecutionSummary;
  goalsSummary: GoalsEvaluationSummary;
  cashFlowProjection: CashFlowProjectionResult;
  alerts: DeterministicPlanningAlert[];
}): ConsultativePlanningSnapshot {
  const { referenceMonth, budgetSummary, goalsSummary, cashFlowProjection, alerts } = params;

  return {
    period: referenceMonth,
    budgetSummary: {
      totalPlanned: budgetSummary.totalPlanned,
      totalSpent: budgetSummary.totalBudgetedRealizedSpent,
      executionPct: budgetSummary.globalExecutionPct,
      overBudgetCategories: budgetSummary.items
        .filter((i) => i.isOverBudget)
        .slice(0, 5)
        .map((i) => ({
          name: i.budgetName,
          planned: i.plannedAmount,
          spent: i.realizedSpent,
          pct: i.executionPct,
        })),
    },
    goalsSummary: {
      activeCount: goalsSummary.activeGoalsCount,
      atRiskCount: goalsSummary.atRiskGoalsCount,
      isOverAllocated: goalsSummary.isReserveOverAllocated,
      totalPlannedContributions: goalsSummary.totalPlannedMonthlyContributions,
    },
    cashFlowSummary: {
      initialLiquidBalance: cashFlowProjection.initialLiquidBalance,
      lowestProjectedBalance: cashFlowProjection.lowestProjectedBalance,
      lowestProjectedMonth: cashFlowProjection.lowestProjectedMonth,
      horizonMonths: cashFlowProjection.horizonMonths,
      projected30DaysBalance: cashFlowProjection.horizonSummaries?.days30?.projectedClosingBalance,
      projected60DaysBalance: cashFlowProjection.horizonSummaries?.days60?.projectedClosingBalance,
      projected90DaysBalance: cashFlowProjection.horizonSummaries?.days90?.projectedClosingBalance,
      expectedIncomePeriod: cashFlowProjection.indicators?.expectedIncomePeriod,
      realizedIncomePeriod: cashFlowProjection.indicators?.realizedIncomePeriod,
      varianceExpectationVsRealized: cashFlowProjection.indicators?.varianceExpectationVsRealized,
      overdueUnreconciledIncome: cashFlowProjection.indicators?.overdueUnreconciledIncome,
    },
    activeAlertsCount: alerts.length,
  };
}
