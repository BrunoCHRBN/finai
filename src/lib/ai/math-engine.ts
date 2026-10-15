export interface FinancialMetrics {
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  savingsRatePct: number;
  fixedExpenses: number;
  variableExpenses: number;
  investmentAmount: number;
  fixedPct: number;
  variablePct: number;
  investmentPct: number;
  runwayMonths: number;
  totalLiquidBalance: number;
  maturityLevel: 1 | 2 | 3 | 4;
  budgetDeviations: Array<{
    categoryName: string;
    budgetLimit: number;
    actualSpent: number;
    diffPct: number;
    isOverBudget: boolean;
  }>;
}

export interface RawTransaction {
  id: string;
  amount: number;
  date: string;
  type: string;
  categoryGroup?: string;
  categoryName?: string;
  budgetLimit?: number;
}

export interface RawAccount {
  id: string;
  type: string;
  balance: number;
}

/**
 * DETERMINISTIC ENGINE (0 Tokens Consumed)
 * Calculates all mathematical aggregations, variances, runway and maturity level
 */
export function calculateFinancialMetrics(
  transactions: RawTransaction[],
  accounts: RawAccount[],
  categoriesWithBudgets: Array<{ id: string; name: string; group: string; budgetLimit: number }>
): FinancialMetrics {
  let totalIncome = 0;
  let totalExpenses = 0;
  let fixedExpenses = 0;
  let variableExpenses = 0;
  let investmentAmount = 0;

  const categorySpentMap: Record<string, number> = {};

  for (const tx of transactions) {
    if (tx.amount > 0) {
      totalIncome += tx.amount;
    } else {
      const absAmount = Math.abs(tx.amount);
      totalExpenses += absAmount;

      const group = (tx.categoryGroup || 'VARIABLE').toUpperCase();
      if (group === 'FIXED') {
        fixedExpenses += absAmount;
      } else if (group === 'INVESTMENT') {
        investmentAmount += absAmount;
      } else {
        variableExpenses += absAmount;
      }

      if (tx.categoryName) {
        categorySpentMap[tx.categoryName] = (categorySpentMap[tx.categoryName] || 0) + absAmount;
      }
    }
  }

  // Net Cash Flow & Savings Rate
  const netCashFlow = totalIncome - totalExpenses;
  const savingsRatePct = totalIncome > 0 
    ? Math.max(0, Math.round(((totalIncome - (fixedExpenses + variableExpenses)) / totalIncome) * 100)) 
    : 0;

  // 50/30/20 proportions relative to total income (or expenses if no income)
  const baseForPct = totalIncome > 0 ? totalIncome : (totalExpenses || 1);
  const fixedPct = Math.round((fixedExpenses / baseForPct) * 100);
  const variablePct = Math.round((variableExpenses / baseForPct) * 100);
  const investmentPct = Math.round((investmentAmount / baseForPct) * 100);

  // Liquid balance from CHECKING, SAVINGS, and positive balances
  let totalLiquidBalance = 0;
  for (const acc of accounts) {
    if (acc.type !== 'CREDIT_CARD' && acc.balance > 0) {
      totalLiquidBalance += acc.balance;
    }
  }

  // Runway = Total Liquid Balance / Fixed (or Total) Monthly Burn Rate
  const monthlyBurn = fixedExpenses > 0 ? fixedExpenses : (totalExpenses || 1);
  const runwayMonths = Math.round((totalLiquidBalance / monthlyBurn) * 10) / 10;

  // Budget Deviations
  const budgetDeviations: FinancialMetrics['budgetDeviations'] = [];
  for (const cat of categoriesWithBudgets) {
    if (cat.budgetLimit > 0) {
      const actualSpent = categorySpentMap[cat.name] || 0;
      const diffPct = Math.round(((actualSpent - cat.budgetLimit) / cat.budgetLimit) * 100);
      budgetDeviations.push({
        categoryName: cat.name,
        budgetLimit: cat.budgetLimit,
        actualSpent: Math.round(actualSpent * 100) / 100,
        diffPct,
        isOverBudget: actualSpent > cat.budgetLimit,
      });
    }
  }

  // Sort deviations: biggest overspenders first
  budgetDeviations.sort((a, b) => b.diffPct - a.diffPct);

  // Determine Maturity Level
  // Level 1: Sobrevivência/Dívida (Runway < 1 mês ou fluxo de caixa negativo severo)
  // Level 2: Construção de Base (Runway 1-5 meses, reserva em formação)
  // Level 3: Acumulador Ativo (Runway >= 6 meses, Taxa de poupança > 20%)
  // Level 4: Investidor Consolidado (Runway >= 12 meses, patrimônio relevante e diversificado)
  let maturityLevel: 1 | 2 | 3 | 4 = 1;
  if (runwayMonths < 1 || netCashFlow < 0) {
    maturityLevel = 1;
  } else if (runwayMonths >= 1 && runwayMonths < 6) {
    maturityLevel = 2;
  } else if (runwayMonths >= 6 && runwayMonths < 12) {
    maturityLevel = 3;
  } else {
    maturityLevel = 4;
  }

  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netCashFlow: Math.round(netCashFlow * 100) / 100,
    savingsRatePct,
    fixedExpenses: Math.round(fixedExpenses * 100) / 100,
    variableExpenses: Math.round(variableExpenses * 100) / 100,
    investmentAmount: Math.round(investmentAmount * 100) / 100,
    fixedPct,
    variablePct,
    investmentPct,
    runwayMonths,
    totalLiquidBalance: Math.round(totalLiquidBalance * 100) / 100,
    maturityLevel,
    budgetDeviations,
  };
}
