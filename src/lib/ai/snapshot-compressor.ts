import type { FinancialMetrics } from './math-engine.ts';
import type { PatrimonialSummary } from '../patrimony-engine.ts';
import {
  buildConsultativePlanningSnapshot,
  type BudgetExecutionSummary,
  type GoalsEvaluationSummary,
  type CashFlowProjectionResult,
  type DeterministicPlanningAlert,
  type ConsultativePlanningSnapshot,
  type SavingsSimulationResult,
} from '../planning-engine.ts';

/**
 * Legacy compressed snapshot interface preserved for backward compatibility.
 */
export interface CompressedFinancialSnapshot {
  period: string;
  currency: string;
  summary: {
    income: number;
    expenses: number;
    savings: number;
    savingsRate: string;
    creditCardExpenses: number;
    cashExpenses: number;
    ignoredCount: number;
    transferCount: number;
  };
  expenseBreakdown: Array<{
    category: string;
    amount: number;
    share: string;
  }>;
  topExpenses: Array<{
    description: string;
    amount: number;
    category: string;
  }>;
  budgetStatus: Array<{
    category: string;
    spent: number;
    budgeted: number;
    utilization: string;
    status: 'OK' | 'WARNING' | 'OVER_BUDGET';
  }>;
  momTrend: {
    incomeDelta: string;
    expenseDelta: string;
  };
}

/**
 * Unified, privacy-hardened consultative financial snapshot for Sprint 5 Copilot & Multi-Model Gemini.
 * Strictly contains deterministic outputs from math-engine, patrimony-engine, and planning-engine.
 * Never includes credentials, tokens, bank account numbers, CPF/CNPJ, or raw transaction dumps.
 */
export interface UnifiedConsultativeSnapshot extends CompressedFinancialSnapshot {
  snapshotVersion: 'SPRINT_5_V1';
  generatedAt: string;
  patrimony: {
    totalAssets: number;
    totalLiabilities: number;
    netWorth: number;
    liquidAssets: number;
    investedAssets: number;
    fixedAssets: number;
    creditCardDebt: number;
    overdraftDebt: number;
    structuredDebt: number;
    debtToAssetRatioPct: number;
    liquidityRatio: number;
    openFinanceCoveragePct: number;
    manualCoveragePct: number;
  };
  planning: ConsultativePlanningSnapshot & {
    budgetItems: Array<{
      category: string;
      planned: number;
      spent: number;
      remaining: number;
      executionPct: number;
      alertLevel: 'OK' | 'WARNING' | 'EXCEEDED' | 'CLOSED';
    }>;
    unbudgetedSpent: number;
    verifiedAvailableReserve: number;
    unallocatedAvailableReserve: number;
    goals: Array<{
      title: string;
      category: string;
      status: string;
      targetAmount: number;
      currentAmount: number;
      backedByRealBalance: number;
      progressPct: number;
      plannedMonthlyContribution: number;
      requiredMonthlyContribution: number | null;
      deadline: string | null;
      feasibility: string;
    }>;
    projection: {
      horizonMonths: number;
      initialLiquidBalance: number;
      priorUnsettledCardDebt: number;
      lowestProjectedBalance: number;
      lowestProjectedMonth: string;
      averageHistoricalIncome: number;
      averageHistoricalExpenses: number;
      months: Array<{
        month: string;
        openingLiquidBalance: number;
        realizedNet: number;
        confirmedNet: number;
        estimatedNet: number;
        closingConfirmedBalance: number;
        closingProjectedBalance: number;
        isLiquidityBelowThreshold: boolean;
        isNegativeLiquidity: boolean;
      }>;
      hypotheses: Array<{
        code: string;
        category: string;
        description: string;
      }>;
    };
    activeAlerts: Array<{
      type: string;
      severity: string;
      title: string;
      reason: string;
      period: string;
    }>;
    savingsSimulationSummary?: {
      monthlyContribution: number;
      horizonMonths: number;
      realisticFinalNominal: number;
      realisticFinalReal: number;
      fiTargetCapital: number;
      monthsToReachFI: number | null;
    };
  };
  dataQuality: {
    hasAccounts: boolean;
    hasTransactions: boolean;
    hasBudgets: boolean;
    hasGoals: boolean;
    hasPatrimony: boolean;
    hasHistoricalMonths: boolean;
    analyzedHistoricalMonthsCount: number;
    isPartialData: boolean;
    limitations: string[];
  };
}

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above|system)\s+(instructions|prompts|rules|directions)/gi,
  /disregard\s+(all\s+)?(previous|prior|above|system)\s+(instructions|prompts|rules)/gi,
  /forget\s+(all\s+)?(previous|prior|system)\s+(instructions|prompts|rules)/gi,
  /(?:^|\n)\s*(?:system|assistant|developer|user)\s*:/gi,
  /<\|(?:im_start|im_end|system|user|assistant|endoftext)\|>/gi,
  /\[(?:SYSTEM|INST|\/INST|ASSISTANT)\]/gi,
  /<\s*\/?\s*(?:system|instruction|prompt|script|iframe|object|embed)\b[^>]*>/gi,
  /(?:reveal|print|show|output|leak)\s+(?:your\s+)?(?:system\s+prompt|api\s*key|secret|token|instructions)/gi,
];

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  // CPF (000.000.000-00) or CNPJ (00.000.000/0000-00)
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
  /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g,
  // Credit card / long account numbers (12 to 19 continuous digits or 4x4 groups)
  /\b(?:\d{4}[-\s]?){3,4}\d{1,4}\b/g,
  /\b\d{11,19}\b/g,
  // Bearer / API keys / UUIDs that look like Pluggy item/account tokens
  /\b(?:AIza[0-9A-Za-z-_]{20,}|sk-[0-9A-Za-z]{20,}|Bearer\s+[0-9A-Za-z._-]+)\b/gi,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
];

const SENSITIVE_OBJECT_KEYS = new Set([
  'apikey',
  'api_key',
  'gemini_api_key',
  'secret',
  'clientsecret',
  'client_secret',
  'password',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'authorization',
  'pluggyitemid',
  'pluggy_item_id',
  'pluggyaccountid',
  'pluggy_account_id',
  'pluggytransactionid',
  'pluggy_transaction_id',
  'accountnumber',
  'account_number',
  'documentnumber',
  'document_number',
  'taxnumber',
  'tax_number',
  'cpf',
  'cnpj',
]);

/**
 * Sanitizes untrusted strings (such as bank transaction descriptions, goal notes, or user inputs)
 * to prevent prompt injection and strip accidental PII/credentials before building AI context.
 */
export function sanitizeUntrustedText(input: unknown, maxLength = 80): string {
  if (typeof input !== 'string') return '';
  let text = input
    // Remove control characters except standard space
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .trim();

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    text = text.replace(pattern, '[REDACTED_INSTRUCTION]');
  }

  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    text = text.replace(pattern, '[REDACTED_ID]');
  }

  // Collapse multiple spaces
  text = text.replace(/\s+/g, ' ').trim();

  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength - 1)}…`;
  }

  return text;
}

/**
 * Deeply clones and strips any sensitive keys or credential patterns from an object
 * before it is serialized or sent to an external AI provider.
 */
export function stripSensitiveFields<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    return sanitizeUntrustedText(input, 500) as unknown as T;
  }
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) {
    return input.map((item) => stripSensitiveFields(item)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (SENSITIVE_OBJECT_KEYS.has(normalizedKey)) {
      continue;
    }
    out[key] = stripSensitiveFields(value);
  }
  return out as T;
}

/**
 * Legacy compressor preserved for existing callers and backwards compatibility.
 */
export function compressFinancialData(
  period: string,
  metrics: FinancialMetrics,
  budgets: Array<{ category: string; amount: number; spent: number }>
): CompressedFinancialSnapshot {
  return {
    period,
    currency: 'BRL',
    summary: {
      income: metrics.totalIncome,
      expenses: metrics.totalExpenses,
      savings: metrics.netSavings,
      savingsRate: `${metrics.savingsRate.toFixed(1)}%`,
      creditCardExpenses: metrics.creditCardExpenses,
      cashExpenses: metrics.cashExpenses,
      ignoredCount: metrics.ignoredCount,
      transferCount: metrics.transferCount,
    },
    expenseBreakdown: metrics.topCategories.slice(0, 6).map((c) => ({
      category: sanitizeUntrustedText(c.category, 40),
      amount: c.amount,
      share: `${c.percentage.toFixed(1)}%`,
    })),
    topExpenses: metrics.top5Expenses.slice(0, 5).map((t) => ({
      description: sanitizeUntrustedText(t.description, 45),
      amount: t.amount,
      category: sanitizeUntrustedText(t.category, 40),
    })),
    budgetStatus: budgets.map((b) => {
      const utilization = b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
      let status: 'OK' | 'WARNING' | 'OVER_BUDGET' = 'OK';
      if (utilization >= 100) status = 'OVER_BUDGET';
      else if (utilization >= 80) status = 'WARNING';

      return {
        category: sanitizeUntrustedText(b.category, 40),
        spent: b.spent,
        budgeted: b.amount,
        utilization: `${utilization.toFixed(1)}%`,
        status,
      };
    }),
    momTrend: {
      incomeDelta: `${metrics.monthlyComparison.incomeChange >= 0 ? '+' : ''}${metrics.monthlyComparison.incomeChange.toFixed(1)}%`,
      expenseDelta: `${metrics.monthlyComparison.expenseChange >= 0 ? '+' : ''}${metrics.monthlyComparison.expenseChange.toFixed(1)}%`,
    },
  };
}

/**
 * Builds the complete, sanitized Sprint 5 UnifiedConsultativeSnapshot from the three
 * deterministic domain engines (math-engine, patrimony-engine, planning-engine).
 */
export function buildUnifiedConsultativeSnapshot(params: {
  period: string;
  metrics: FinancialMetrics;
  patrimonySummary: PatrimonialSummary;
  budgetSummary: BudgetExecutionSummary;
  goalsSummary: GoalsEvaluationSummary;
  cashFlowProjection: CashFlowProjectionResult;
  alerts: DeterministicPlanningAlert[];
  savingsSimulation?: SavingsSimulationResult;
  counts?: {
    accountsCount: number;
    transactionsCount: number;
    budgetsCount: number;
    goalsCount: number;
    patrimonialAssetsCount: number;
    patrimonialLiabilitiesCount: number;
  };
}): UnifiedConsultativeSnapshot {
  const {
    period,
    metrics,
    patrimonySummary,
    budgetSummary,
    goalsSummary,
    cashFlowProjection,
    alerts,
    savingsSimulation,
    counts,
  } = params;

  const baseLegacy = compressFinancialData(
    period,
    metrics,
    budgetSummary.items.map((item) => ({
      category: item.categoryName,
      amount: item.plannedAmount,
      spent: item.realizedSpent,
    }))
  );

  const consultativePlanning = buildConsultativePlanningSnapshot({
    referenceMonth: period,
    budgetSummary,
    goalsSummary,
    cashFlowProjection,
    alerts,
  });

  const limitations: string[] = [];
  const hasAccounts = (counts?.accountsCount ?? 1) > 0;
  const hasTransactions =
    (counts?.transactionsCount ?? 1) > 0 &&
    (metrics.totalIncome > 0 || metrics.totalExpenses > 0);
  const hasBudgets = budgetSummary.items.length > 0;
  const hasGoals = goalsSummary.goals.length > 0;
  const hasPatrimony =
    patrimonySummary.totalAssets > 0 || patrimonySummary.totalLiabilities > 0;
  const analyzedMonthsCount = cashFlowProjection.historicalContext.analyzedMonths.length;
  const hasHistoricalMonths = analyzedMonthsCount >= 2;

  if (!hasAccounts) {
    limitations.push(
      'Nenhuma conta bancária ativa está cadastrada; o saldo líquido inicial é R$ 0,00.'
    );
  }
  if (!hasTransactions) {
    limitations.push(
      `Não há transações operacionais registradas no período ${period}; receitas e despesas realizadas estão zeradas.`
    );
  }
  if (!hasBudgets) {
    limitations.push(
      `Nenhum orçamento por categoria foi definido para ${period}; a execução orçamentária não possui limites planejados.`
    );
  }
  if (budgetSummary.totalUnbudgetedSpent > 0) {
    limitations.push(
      `Há R$ ${budgetSummary.totalUnbudgetedSpent.toFixed(2)} em despesas realizadas fora de categorias orçadas.`
    );
  }
  if (!hasGoals) {
    limitations.push('Nenhuma meta financeira ativa foi configurada pelo usuário.');
  }
  if (!hasHistoricalMonths) {
    limitations.push(
      `Histórico curto (${analyzedMonthsCount} mês(es) com movimentação); médias históricas têm menor poder estatístico.`
    );
  }
  const allPatrimonialItems = [
    ...(patrimonySummary.assetsList || []),
    ...(patrimonySummary.liabilitiesList || []),
  ];
  const totalPatrimonialValue = allPatrimonialItems.reduce(
    (acc, item) => acc + Math.abs(item.value || 0),
    0
  );
  const openFinanceValue = allPatrimonialItems
    .filter((item) => item.dataSource === 'OPEN_FINANCE')
    .reduce((acc, item) => acc + Math.abs(item.value || 0), 0);
  const openFinanceCoveragePct =
    totalPatrimonialValue > 0
      ? Math.round((openFinanceValue / totalPatrimonialValue) * 1000) / 10
      : 0;
  const manualCoveragePct =
    totalPatrimonialValue > 0
      ? Math.round((100 - openFinanceCoveragePct) * 10) / 10
      : 0;

  const creditCardDebt = (patrimonySummary.liabilitiesList || [])
    .filter((l) => l.category === 'CREDIT_CARD')
    .reduce((acc, l) => acc + Math.abs(l.value || 0), 0);
  const overdraftDebt = (patrimonySummary.liabilitiesList || [])
    .filter((l) => l.category === 'OVERDRAFT_DEBT')
    .reduce((acc, l) => acc + Math.abs(l.value || 0), 0);
  const structuredDebt =
    patrimonySummary.longTermLiabilities ??
    Math.max(
      0,
      patrimonySummary.totalLiabilities - creditCardDebt - overdraftDebt
    );
  const debtToAssetRatioPct = patrimonySummary.debtToAssetRatioPct ?? 0;
  const liquidityRatio =
    patrimonySummary.shortTermLiabilities > 0
      ? Math.round(
          (patrimonySummary.liquidAssets /
            patrimonySummary.shortTermLiabilities) *
            100
        ) / 100
      : patrimonySummary.liquidAssets > 0
        ? 10
        : 0;

  if (manualCoveragePct > 50 && totalPatrimonialValue > 0) {
    limitations.push(
      `${manualCoveragePct.toFixed(0)}% dos itens patrimoniais são declarados manualmente (sem verificação automática via Open Finance).`
    );
  }

  const baseScenario = savingsSimulation?.scenarios.find(
    (s) => s.id === 'BASE'
  );

  return {
    ...baseLegacy,
    snapshotVersion: 'SPRINT_5_V1',
    generatedAt: new Date().toISOString(),
    patrimony: {
      totalAssets: patrimonySummary.totalAssets,
      totalLiabilities: patrimonySummary.totalLiabilities,
      netWorth: patrimonySummary.netWorth,
      liquidAssets: patrimonySummary.liquidAssets,
      investedAssets: patrimonySummary.investedAssets,
      fixedAssets: patrimonySummary.fixedAssets,
      creditCardDebt,
      overdraftDebt,
      structuredDebt,
      debtToAssetRatioPct,
      liquidityRatio,
      openFinanceCoveragePct,
      manualCoveragePct,
    },
    planning: {
      ...consultativePlanning,
      budgetItems: budgetSummary.items.slice(0, 10).map((b) => {
        const alertLevel: 'OK' | 'WARNING' | 'EXCEEDED' | 'CLOSED' =
          b.indicator === 'OVER_BUDGET'
            ? 'EXCEEDED'
            : b.indicator === 'NEAR_LIMIT'
              ? 'WARNING'
              : b.indicator === 'CLOSED'
                ? 'CLOSED'
                : 'OK';
        return {
          category: sanitizeUntrustedText(b.categoryName, 40),
          planned: b.plannedAmount,
          spent: b.realizedSpent,
          remaining: b.remainingBalance,
          executionPct: b.executionPct,
          alertLevel,
        };
      }),
      unbudgetedSpent: budgetSummary.totalUnbudgetedSpent,
      verifiedAvailableReserve: goalsSummary.verifiedAvailableReserve,
      unallocatedAvailableReserve: goalsSummary.unallocatedAvailableReserve,
      goals: goalsSummary.goals.slice(0, 8).map((g) => ({
        title: sanitizeUntrustedText(g.title, 45),
        category: sanitizeUntrustedText(g.category, 30),
        status: g.status,
        targetAmount: g.targetAmount,
        currentAmount: g.declaredCurrentAmount,
        backedByRealBalance: g.backedByRealBalance,
        progressPct: g.progressPct,
        plannedMonthlyContribution: g.plannedMonthlyContribution,
        requiredMonthlyContribution: g.requiredMonthlyContribution,
        deadline: g.deadline,
        feasibility: g.feasibility,
      })),
      projection: {
        horizonMonths: cashFlowProjection.horizonMonths,
        initialLiquidBalance: cashFlowProjection.initialLiquidBalance,
        priorUnsettledCardDebt: cashFlowProjection.priorUnsettledCardDebt,
        lowestProjectedBalance: cashFlowProjection.lowestProjectedBalance,
        lowestProjectedMonth: cashFlowProjection.lowestProjectedMonth,
        averageHistoricalIncome:
          cashFlowProjection.historicalContext.averageMonthlyIncome,
        averageHistoricalExpenses:
          cashFlowProjection.historicalContext.averageMonthlyExpenses,
        months: cashFlowProjection.months.slice(0, 6).map((m) => ({
          month: m.month,
          openingLiquidBalance: m.openingLiquidBalance,
          realizedNet: m.realized.net,
          confirmedNet: m.confirmed.net,
          estimatedNet: m.estimated.net,
          closingConfirmedBalance: m.closingConfirmedBalance,
          closingProjectedBalance: m.closingTotalProjectedBalance,
          isLiquidityBelowThreshold: m.isLiquidityBelowThreshold,
          isNegativeLiquidity: m.isNegativeLiquidity,
        })),
        hypotheses: cashFlowProjection.hypotheses.map((h) => ({
          code: h.code,
          category: h.category,
          description: sanitizeUntrustedText(h.description, 140),
        })),
      },
      activeAlerts: alerts.slice(0, 8).map((a) => ({
        type: a.type,
        severity: a.severity,
        title: sanitizeUntrustedText(a.title, 70),
        reason: sanitizeUntrustedText(a.reason, 160),
        period: a.period,
      })),
      savingsSimulationSummary: savingsSimulation
        ? {
            monthlyContribution: savingsSimulation.inputs.monthlyContribution,
            horizonMonths: savingsSimulation.inputs.horizonMonths,
            realisticFinalNominal:
              baseScenario?.finalNominalBalance ??
              savingsSimulation.baseResult.finalNominalBalance,
            realisticFinalReal:
              baseScenario?.finalRealBalance ??
              savingsSimulation.baseResult.finalRealBalance,
            fiTargetCapital:
              savingsSimulation.financialIndependence
                .requiredCapitalAtConfiguredRate,
            monthsToReachFI:
              savingsSimulation.financialIndependence.monthsToReachFI,
          }
        : undefined,
    },
    dataQuality: {
      hasAccounts,
      hasTransactions,
      hasBudgets,
      hasGoals,
      hasPatrimony,
      hasHistoricalMonths,
      analyzedHistoricalMonthsCount: analyzedMonthsCount,
      isPartialData:
        !hasAccounts || !hasTransactions || !hasBudgets || !hasHistoricalMonths,
      limitations,
    },
  };
}

// ============================================================================
// SHORT-LIVED SNAPSHOT CACHE WITH AUTOMATIC FINGERPRINT INVALIDATION
// ============================================================================

interface CachedSnapshotEntry {
  key: string;
  fingerprint: string;
  expiresAtMs: number;
  snapshot: UnifiedConsultativeSnapshot;
}

const snapshotCache = new Map<string, CachedSnapshotEntry>();
const DEFAULT_SNAPSHOT_TTL_MS = 15_000; // 15 seconds TTL for rapid multi-turn chat

export function computeSnapshotDataFingerprint(parts: {
  period: string;
  accountsCount: number;
  transactionsCount: number;
  budgetsCount: number;
  goalsCount: number;
  assetsCount: number;
  liabilitiesCount: number;
  recurringCount: number;
  latestTransactionId?: string;
  totalAccountBalanceSum?: number;
  totalBudgetPlannedSum?: number;
  totalGoalCurrentSum?: number;
  totalAssetsValueSum?: number;
  totalLiabilitiesBalanceSum?: number;
  totalRecurringAmountSum?: number;
  ignoredTransactionsCount?: number;
  stateDigest?: string;
}): string {
  const base = [
    parts.period,
    parts.accountsCount,
    parts.transactionsCount,
    parts.budgetsCount,
    parts.goalsCount,
    parts.assetsCount,
    parts.liabilitiesCount,
    parts.recurringCount,
    parts.latestTransactionId || 'none',
    (parts.totalAccountBalanceSum ?? 0).toFixed(2),
    (parts.totalBudgetPlannedSum ?? 0).toFixed(2),
    (parts.totalGoalCurrentSum ?? 0).toFixed(2),
  ];
  if (
    parts.totalAssetsValueSum !== undefined ||
    parts.totalLiabilitiesBalanceSum !== undefined ||
    parts.totalRecurringAmountSum !== undefined ||
    parts.ignoredTransactionsCount !== undefined ||
    parts.stateDigest
  ) {
    base.push(
      (parts.totalAssetsValueSum ?? 0).toFixed(2),
      (parts.totalLiabilitiesBalanceSum ?? 0).toFixed(2),
      (parts.totalRecurringAmountSum ?? 0).toFixed(2),
      String(parts.ignoredTransactionsCount ?? 0),
      parts.stateDigest || ''
    );
  }
  return base.join('|');
}

export function getCachedConsultativeSnapshot(
  period: string,
  fingerprint: string,
  nowMs = Date.now()
): UnifiedConsultativeSnapshot | null {
  const entry = snapshotCache.get(period);
  if (!entry) return null;
  if (nowMs > entry.expiresAtMs || entry.fingerprint !== fingerprint) {
    snapshotCache.delete(period);
    return null;
  }
  return entry.snapshot;
}

export function setCachedConsultativeSnapshot(
  period: string,
  fingerprint: string,
  snapshot: UnifiedConsultativeSnapshot,
  ttlMs = DEFAULT_SNAPSHOT_TTL_MS,
  nowMs = Date.now()
): void {
  snapshotCache.set(period, {
    key: period,
    fingerprint,
    expiresAtMs: nowMs + ttlMs,
    snapshot,
  });
}

export function invalidateConsultativeSnapshotCache(period?: string): void {
  if (period) {
    snapshotCache.delete(period);
  } else {
    snapshotCache.clear();
  }
}
