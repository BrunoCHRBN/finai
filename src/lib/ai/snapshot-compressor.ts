import { FinancialMetrics } from './math-engine';

export interface SyntheticFinancialSnapshot {
  level: number;
  period: string;
  kpis: {
    income: number;
    expense: number;
    net: number;
    savings_rate: number;
    runway_m: number;
    liquid_bal: number;
  };
  rules_50_30_20: {
    fixed_pct: number;
    var_pct: number;
    invest_pct: number;
  };
  top_deviations: Array<{
    cat: string;
    budget: number;
    spent: number;
    over_pct: number;
  }>;
  goals_summary?: Array<{
    title: string;
    target: number;
    current: number;
    progress_pct: number;
  }>;
}

/**
 * Compresses raw data into a dense, token-minimal snapshot (< 180 tokens)
 */
export function buildSyntheticSnapshot(
  period: string,
  metrics: FinancialMetrics,
  goals: Array<{ title: string; targetAmount: number; currentAmount: number }> = []
): SyntheticFinancialSnapshot {
  // Only send the top 3 overbudget categories to save tokens
  const topDeviations = metrics.budgetDeviations
    .filter((d) => d.isOverBudget)
    .slice(0, 3)
    .map((d) => ({
      cat: d.categoryName,
      budget: d.budgetLimit,
      spent: d.actualSpent,
      over_pct: d.diffPct,
    }));

  const goalsSummary = goals.slice(0, 3).map((g) => ({
    title: g.title,
    target: g.targetAmount,
    current: g.currentAmount,
    progress_pct: Math.round((g.currentAmount / (g.targetAmount || 1)) * 100),
  }));

  return {
    level: metrics.maturityLevel,
    period,
    kpis: {
      income: metrics.totalIncome,
      expense: metrics.totalExpenses,
      net: metrics.netCashFlow,
      savings_rate: metrics.savingsRatePct,
      runway_m: metrics.runwayMonths,
      liquid_bal: metrics.totalLiquidBalance,
    },
    rules_50_30_20: {
      fixed_pct: metrics.fixedPct,
      var_pct: metrics.variablePct,
      invest_pct: metrics.investmentPct,
    },
    top_deviations: topDeviations,
    goals_summary: goalsSummary,
  };
}
