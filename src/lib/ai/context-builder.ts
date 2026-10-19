import { db, ensureDbInitialized } from '@/db';
import {
  accounts,
  categories,
  budgets,
  transactions,
  goals,
  recurringFlows,
  recurringOccurrences,
  patrimonialAssets,
  patrimonialLiabilities,
  planningPreferences,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import { calculateFinancialMetrics, type RawTransaction } from './math-engine.ts';
import { calculatePatrimonialSummary } from '../patrimony-engine.ts';
import {
  prepareCanonicalTransactions,
  calculateBudgetExecution,
  evaluateFinancialGoals,
  calculateCashFlowProjection,
  simulateSavingsScenarios,
  evaluatePlanningAlerts,
} from '../planning-engine.ts';
import {
  type UnifiedConsultativeSnapshot,
  buildUnifiedConsultativeSnapshot,
  computeSnapshotDataFingerprint,
  getCachedConsultativeSnapshot,
  setCachedConsultativeSnapshot,
} from './snapshot-compressor.ts';

export interface LoadConsultativeSnapshotResult {
  snapshot: UnifiedConsultativeSnapshot;
  cacheHit: boolean;
  buildDurationMs: number;
}

/**
 * Loads or reuses a short-lived UnifiedConsultativeSnapshot for the requested period
 * without executing redundant database or deterministic engine passes.
 */
export async function loadOrBuildConsultativeSnapshot(
  period: string,
  options?: { bypassCache?: boolean; horizonMonths?: number }
): Promise<LoadConsultativeSnapshotResult> {
  const startMs = performance.now();
  await ensureDbInitialized();

  const horizonMonths = Math.min(36, Math.max(1, options?.horizonMonths ?? 6));

  const [
    allAccounts,
    allCategories,
    monthBudgets,
    allTransactions,
    allGoals,
    allRecurring,
    allOccurrences,
    allAssets,
    allLiabilities,
    allPrefs,
  ] = await Promise.all([
    db.select().from(accounts),
    db.select().from(categories),
    db.select().from(budgets).where(eq(budgets.month, period)),
    db.select().from(transactions),
    db.select().from(goals),
    db.select().from(recurringFlows),
    db.select().from(recurringOccurrences),
    db.select().from(patrimonialAssets),
    db.select().from(patrimonialLiabilities),
    db.select().from(planningPreferences),
  ]);

  const totalAccountBalanceSum = allAccounts.reduce(
    (acc, a) => acc + (Number(a.balance) || 0),
    0
  );
  const totalBudgetPlannedSum = monthBudgets.reduce(
    (acc, b) => acc + (Number(b.plannedAmount) || 0),
    0
  );
  const totalGoalCurrentSum = allGoals.reduce(
    (acc, g) =>
      acc +
      (Number(g.currentAmount) || 0) +
      (Number(g.plannedMonthlyContribution) || 0) +
      (Number(g.targetAmount) || 0),
    0
  );
  const totalAssetsValueSum = allAssets.reduce(
    (acc, a) => acc + (Number(a.currentValue) || 0),
    0
  );
  const totalLiabilitiesBalanceSum = allLiabilities.reduce(
    (acc, l) => acc + (Number(l.currentBalance) || 0),
    0
  );
  const totalRecurringAmountSum = allRecurring.reduce(
    (acc, r) => acc + (r.isActive ? Number(r.amount) || 0 : 0),
    0
  );
  const ignoredTransactionsCount = allTransactions.reduce(
    (acc, t) => acc + (t.isIgnored ? 1 : 0),
    0
  );
  const latestTx = allTransactions[allTransactions.length - 1];

  // Fast deterministic state digest over all mutable records to guarantee immediate invalidation
  const txDigest = allTransactions
    .map(
      (t) =>
        `${t.id}:${t.amount}:${t.type}:${t.isIgnored ?? 0}:${t.categoryId || ''}:${t.date}`
    )
    .join(';');
  const budgetDigest = monthBudgets
    .map((b) => `${b.id}:${b.plannedAmount}:${b.status || 'ACTIVE'}`)
    .join(';');
  const catDigest = allCategories
    .map((c) => `${c.id}:${c.budgetLimit ?? 0}`)
    .join(';');
  const goalDigest = allGoals
    .map(
      (g) =>
        `${g.id}:${g.currentAmount}:${g.targetAmount}:${g.plannedMonthlyContribution}:${g.status || 'ACTIVE'}`
    )
    .join(';');
  const recurringDigest = allRecurring
    .map(
      (r) =>
        `${r.id}:${r.type}:${r.amount}:${r.frequency}:${r.dayOfMonth ?? ''}:${r.secondDayOfMonth ?? ''}:${r.status || ''}:${r.isActive ?? 1}:${r.nextDate || ''}:${r.amountType || ''}`
    )
    .join(';');
  const occDigest = allOccurrences
    .map(
      (o) =>
        `${o.id}:${o.status}:${o.expectedDate}:${o.expectedAmount}:${o.reconciledAmount ?? ''}:${o.transactionId || ''}`
    )
    .join(';');
  const prefDigest = allPrefs
    .map((p) => `${p.id}:${p.syncIntervalMinutes ?? 0}:${p.lastSyncAt ?? ''}`)
    .join(';');
  const stateDigest = `${txDigest}#${budgetDigest}#${catDigest}#${goalDigest}#${recurringDigest}#${occDigest}#${prefDigest}`;

  const fingerprint = computeSnapshotDataFingerprint({
    period: `${period}:h${horizonMonths}`,
    accountsCount: allAccounts.length,
    transactionsCount: allTransactions.length,
    budgetsCount: monthBudgets.length,
    goalsCount: allGoals.length,
    assetsCount: allAssets.length,
    liabilitiesCount: allLiabilities.length,
    recurringCount: allRecurring.length,
    latestTransactionId: latestTx
      ? `${latestTx.id}:${latestTx.amount}:${latestTx.isIgnored}:${latestTx.categoryId}`
      : 'empty',
    totalAccountBalanceSum,
    totalBudgetPlannedSum,
    totalGoalCurrentSum,
    totalAssetsValueSum,
    totalLiabilitiesBalanceSum,
    totalRecurringAmountSum,
    ignoredTransactionsCount,
    stateDigest,
  });

  if (!options?.bypassCache) {
    const cached = getCachedConsultativeSnapshot(period, fingerprint);
    if (cached) {
      return {
        snapshot: cached,
        cacheHit: true,
        buildDurationMs: Math.round((performance.now() - startMs) * 100) / 100,
      };
    }
  }

  // 1. Canonical Reconciled Transactions (shared across math-engine and planning-engine)
  const reconciledTransactions = prepareCanonicalTransactions(
    allTransactions,
    allAccounts
  );

  const periodBudgetMap = new Map(monthBudgets.map((b) => [b.categoryId, b]));
  const categoriesWithEffectiveLimits = allCategories.map((c) => {
    const pb = periodBudgetMap.get(c.id);
    const isClosed = pb?.status === 'CLOSED';
    const effectiveLimit = isClosed
      ? 0
      : pb !== undefined
        ? Number(pb.plannedAmount) || 0
        : Number(c.budgetLimit) || 0;
    return {
      id: c.id,
      name: c.name,
      group: c.group,
      budgetLimit: effectiveLimit,
    };
  });

  const categoryObjMap = new Map(
    categoriesWithEffectiveLimits.map((c) => [c.id, c])
  );
  const accountMap = new Map(allAccounts.map((a) => [a.id, a]));

  const currentTransactionsRaw: RawTransaction[] = [];
  const previousTransactionsRaw: RawTransaction[] = [];

  const [yearStr, monthStr] = period.split('-');
  const yearNum = parseInt(yearStr, 10) || 2026;
  const monthNum = parseInt(monthStr, 10) || 10;
  const prevMonthDate = new Date(Date.UTC(yearNum, monthNum - 2, 1));
  const previousPeriod = `${prevMonthDate.getUTCFullYear()}-${String(
    prevMonthDate.getUTCMonth() + 1
  ).padStart(2, '0')}`;

  for (const t of reconciledTransactions) {
    const acc = t.accountId ? accountMap.get(t.accountId) : undefined;
    const cat = t.categoryId ? categoryObjMap.get(t.categoryId) : undefined;
    const formatted: RawTransaction = {
      id: t.id,
      date: t.date,
      description: t.description,
      amount: t.amount,
      type: t.type,
      categoryGroup: cat?.group || 'VARIABLE',
      categoryName: cat?.name || 'Sem Categoria',
      budgetLimit: cat?.budgetLimit || 0,
      accountId: t.accountId,
      accountType: t.accountType || acc?.type || 'CHECKING',
      isIgnored: t.isIgnored ?? 0,
      transferId: t.transferId,
    };

    if (t.date.startsWith(period)) {
      currentTransactionsRaw.push(formatted);
    } else if (t.date.startsWith(previousPeriod)) {
      previousTransactionsRaw.push(formatted);
    }
  }

  // 2. Operational Metrics (math-engine.ts)
  const metrics = calculateFinancialMetrics(
    currentTransactionsRaw,
    allAccounts.map((a) => ({ id: a.id, type: a.type, balance: a.balance })),
    categoriesWithEffectiveLimits,
    previousTransactionsRaw
  );

  // 3. Patrimonial Summary (patrimony-engine.ts)
  const patrimonySummary = calculatePatrimonialSummary(
    allAccounts,
    allAssets,
    allLiabilities
  );

  // 4. Planning Engine Outputs (planning-engine.ts)
  const prefs = allPrefs[0] || {
    id: 'default',
    minLiquidityThreshold: 1000,
    budgetWarningPct: 80,
    budgetCriticalPct: 100,
    maxDataStalenessDays: 7,
    liabilityDueSoonDays: 7,
  };

  const budgetSummary = calculateBudgetExecution(
    period,
    allCategories,
    monthBudgets,
    reconciledTransactions,
    prefs
  );

  const goalsSummary = evaluateFinancialGoals(allGoals, allAccounts, period);

  const cashFlowProjection = calculateCashFlowProjection({
    referenceMonth: period,
    horizonMonths,
    accounts: allAccounts,
    reconciledTransactions,
    recurringFlows: allRecurring,
    liabilities: allLiabilities,
    goals: allGoals,
    minLiquidityThreshold: prefs.minLiquidityThreshold,
    occurrences: allOccurrences,
  });

  const savingsSimulation = simulateSavingsScenarios({
    initialCapital: Math.max(0, goalsSummary.verifiedAvailableReserve),
    monthlyContribution:
      goalsSummary.totalPlannedMonthlyContributions > 0
        ? goalsSummary.totalPlannedMonthlyContributions
        : Math.max(200, Math.round(Math.max(0, metrics.netSavings) * 0.5)),
    horizonMonths: 120,
    annualNominalReturnPct: 10.5,
    annualInflationPct: 4.5,
    desiredMonthlyIncome: Math.max(3000, Math.round(metrics.totalExpenses || 4000)),
    safeWithdrawalRatePct: 4.0,
  });

  const alerts = evaluatePlanningAlerts({
    referenceMonth: period,
    budgetSummary,
    goalsSummary,
    cashFlowProjection,
    accounts: allAccounts,
    liabilities: allLiabilities,
    preferences: prefs,
  });

  const snapshot = buildUnifiedConsultativeSnapshot({
    period,
    metrics,
    patrimonySummary,
    budgetSummary,
    goalsSummary,
    cashFlowProjection,
    alerts,
    savingsSimulation,
    counts: {
      accountsCount: allAccounts.length,
      transactionsCount: currentTransactionsRaw.length,
      budgetsCount: monthBudgets.length,
      goalsCount: allGoals.length,
      patrimonialAssetsCount: allAssets.length,
      patrimonialLiabilitiesCount: allLiabilities.length,
    },
  });

  setCachedConsultativeSnapshot(period, fingerprint, snapshot);

  return {
    snapshot,
    cacheHit: false,
    buildDurationMs: Math.round((performance.now() - startMs) * 100) / 100,
  };
}
