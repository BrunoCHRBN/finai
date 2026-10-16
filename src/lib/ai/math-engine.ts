import {
  isInvoicePaymentDescription,
  isExpenseRefundOrEstorno,
} from '../transactions.ts';

function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface FinancialMetrics {
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  netSavings: number;
  savingsRatePct: number;
  savingsRate: number;
  fixedExpenses: number;
  variableExpenses: number;
  investmentAmount: number;
  creditCardExpenses: number;
  cashExpenses: number;
  ignoredCount: number;
  transferCount: number;
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
  topCategories: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  top5Expenses: Array<{
    description: string;
    amount: number;
    category: string;
    date: string;
  }>;
  monthlyComparison: {
    incomeChange: number;
    expenseChange: number;
  };
}

export interface RawTransaction {
  id: string;
  amount: number;
  date: string;
  description?: string;
  type: string;
  isIgnored?: number | boolean;
  transferId?: string | null;
  transferPairId?: string | null;
  categoryGroup?: string;
  categoryName?: string;
  budgetLimit?: number;
  accountId?: string | null;
  accountType?: string | null;
}

export interface RawAccount {
  id: string;
  type: string;
  balance: number;
}

/**
 * DETERMINISTIC FINANCIAL ENGINE (0 Tokens Consumed)
 * Calculates operating income, operating expenses, cash flow, savings rate,
 * budget deviations, liquid runway and maturity level.
 *
 * Rules:
 * - Ignored transactions (`isIgnored: 1`) are completely excluded from operating calculations.
 * - Internal transfers (`type: 'TRANSFER'`) and invoice settlements are neutral to operating income & operating expenses.
 * - Credit card purchases (`type: 'DEBIT'`) are included in operating expenses.
 * - Credit card refunds/estornos (`type: 'CREDIT'` on CREDIT_CARD or estorno description) offset operating expenses without inflating income.
 * - Negative checking account balances (overdraft) are factored into total liquid balance.
 */
export function calculateFinancialMetrics(
  transactions: RawTransaction[],
  accountsOrPrevTransactions: RawAccount[] | RawTransaction[] = [],
  categoriesWithBudgets: Array<{
    id: string;
    name: string;
    group: string;
    budgetLimit: number;
  }> = [],
  previousPeriodTransactions: RawTransaction[] = []
): FinancialMetrics {
  // Detect whether second argument is RawAccount[] or previous period RawTransaction[]
  const firstSecondArg = accountsOrPrevTransactions[0] as
    | (RawAccount & RawTransaction)
    | undefined;
  const isSecondArgAccounts =
    firstSecondArg !== undefined &&
    'balance' in firstSecondArg &&
    !('date' in firstSecondArg);

  const accounts: RawAccount[] = isSecondArgAccounts
    ? (accountsOrPrevTransactions as RawAccount[])
    : [];
  const prevTransactions: RawTransaction[] = isSecondArgAccounts
    ? previousPeriodTransactions
    : (accountsOrPrevTransactions as RawTransaction[]);

  let totalIncome = 0;
  let totalExpenses = 0;
  let fixedExpenses = 0;
  let variableExpenses = 0;
  let investmentAmount = 0;
  let creditCardExpenses = 0;
  let cashExpenses = 0;
  let ignoredCount = 0;
  let transferCount = 0;

  const categorySpentMap: Record<string, number> = {};
  const expenseItems: Array<{
    description: string;
    amount: number;
    category: string;
    date: string;
  }> = [];

  for (const tx of transactions || []) {
    // 1. Exclude ignored transactions
    if (tx.isIgnored === 1 || tx.isIgnored === true) {
      ignoredCount++;
      continue;
    }

    const rawType = (tx.type || '').toUpperCase();

    // 2. Exclude transfers and invoice settlements from operating income and operating expenses
    if (rawType === 'TRANSFER' || isInvoicePaymentDescription(tx.description)) {
      transferCount++;
      continue;
    }

    const absAmount = roundCurrency(Math.abs(tx.amount || 0));
    const isRefund = isExpenseRefundOrEstorno({
      type: rawType || (tx.amount > 0 ? 'CREDIT' : 'DEBIT'),
      description: tx.description,
      accountType: tx.accountType,
    });

    if (isRefund) {
      // Credit card / purchase refund offsets operating expenses without inflating income
      totalExpenses = roundCurrency(totalExpenses - absAmount);
      if ((tx.accountType || '').toUpperCase() === 'CREDIT_CARD') {
        creditCardExpenses = roundCurrency(creditCardExpenses - absAmount);
      } else {
        cashExpenses = roundCurrency(cashExpenses - absAmount);
      }
      const group = (tx.categoryGroup || 'VARIABLE').toUpperCase();
      if (group === 'FIXED') {
        fixedExpenses = roundCurrency(fixedExpenses - absAmount);
      } else if (group === 'INVESTMENT') {
        investmentAmount = roundCurrency(investmentAmount - absAmount);
      } else {
        variableExpenses = roundCurrency(variableExpenses - absAmount);
      }
      const catName = tx.categoryName || 'Sem Categoria';
      categorySpentMap[catName] = roundCurrency(
        (categorySpentMap[catName] || 0) - absAmount
      );
      continue;
    }

    const isIncome = rawType === 'CREDIT' || (!tx.type && tx.amount > 0);

    if (isIncome) {
      totalIncome = roundCurrency(totalIncome + absAmount);
    } else {
      totalExpenses = roundCurrency(totalExpenses + absAmount);

      if ((tx.accountType || '').toUpperCase() === 'CREDIT_CARD') {
        creditCardExpenses = roundCurrency(creditCardExpenses + absAmount);
      } else {
        cashExpenses = roundCurrency(cashExpenses + absAmount);
      }

      const group = (tx.categoryGroup || 'VARIABLE').toUpperCase();
      if (group === 'FIXED') {
        fixedExpenses = roundCurrency(fixedExpenses + absAmount);
      } else if (group === 'INVESTMENT') {
        investmentAmount = roundCurrency(investmentAmount + absAmount);
      } else {
        variableExpenses = roundCurrency(variableExpenses + absAmount);
      }

      const catName = tx.categoryName || 'Sem Categoria';
      categorySpentMap[catName] = roundCurrency(
        (categorySpentMap[catName] || 0) + absAmount
      );

      expenseItems.push({
        description: tx.description || catName,
        amount: absAmount,
        category: catName,
        date: tx.date,
      });
    }
  }

  totalIncome = roundCurrency(Math.max(0, totalIncome));
  totalExpenses = roundCurrency(Math.max(0, totalExpenses));
  fixedExpenses = roundCurrency(Math.max(0, fixedExpenses));
  variableExpenses = roundCurrency(Math.max(0, variableExpenses));
  investmentAmount = roundCurrency(Math.max(0, investmentAmount));
  creditCardExpenses = roundCurrency(Math.max(0, creditCardExpenses));
  cashExpenses = roundCurrency(Math.max(0, cashExpenses));

  // Previous period comparison if provided
  let prevIncome = 0;
  let prevExpenses = 0;
  for (const tx of prevTransactions || []) {
    if (tx.isIgnored === 1 || tx.isIgnored === true) continue;
    const rawType = (tx.type || '').toUpperCase();
    if (rawType === 'TRANSFER' || isInvoicePaymentDescription(tx.description)) continue;
    const abs = roundCurrency(Math.abs(tx.amount || 0));
    const isRef = isExpenseRefundOrEstorno({
      type: rawType || (tx.amount > 0 ? 'CREDIT' : 'DEBIT'),
      description: tx.description,
      accountType: tx.accountType,
    });
    if (isRef) {
      prevExpenses = roundCurrency(prevExpenses - abs);
      continue;
    }
    const isInc = rawType === 'CREDIT' || (!tx.type && tx.amount > 0);
    if (isInc) prevIncome = roundCurrency(prevIncome + abs);
    else prevExpenses = roundCurrency(prevExpenses + abs);
  }
  prevIncome = roundCurrency(Math.max(0, prevIncome));
  prevExpenses = roundCurrency(Math.max(0, prevExpenses));

  const incomeChange =
    prevIncome > 0
      ? Math.round(((totalIncome - prevIncome) / prevIncome) * 1000) / 10
      : 0;
  const expenseChange =
    prevExpenses > 0
      ? Math.round(((totalExpenses - prevExpenses) / prevExpenses) * 1000) / 10
      : 0;

  // Net Cash Flow & Savings Rate
  const netCashFlow = roundCurrency(totalIncome - totalExpenses);
  const savingsRate =
    totalIncome > 0
      ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 1000) / 10
      : 0;
  const savingsRatePct =
    totalIncome > 0
      ? Math.max(
          0,
          Math.round(
            ((totalIncome - (fixedExpenses + variableExpenses)) / totalIncome) *
              100
          )
        )
      : 0;

  // 50/30/20 proportions relative to total income (or expenses if no income)
  const baseForPct = totalIncome > 0 ? totalIncome : totalExpenses || 1;
  const fixedPct = Math.round((fixedExpenses / baseForPct) * 100);
  const variablePct = Math.round((variableExpenses / baseForPct) * 100);
  const investmentPct = Math.round((investmentAmount / baseForPct) * 100);

  // Liquid balance from non-credit card accounts (checking, savings, investment cash)
  let totalLiquidBalance = 0;
  for (const acc of accounts || []) {
    if (acc.type !== 'CREDIT_CARD') {
      totalLiquidBalance = roundCurrency(totalLiquidBalance + (acc.balance || 0));
    }
  }

  // Runway = Total Liquid Balance / Fixed (or Total) Monthly Burn Rate
  const monthlyBurn = fixedExpenses > 0 ? fixedExpenses : totalExpenses || 1;
  const runwayMonths = Math.max(
    0,
    Math.round((totalLiquidBalance / monthlyBurn) * 10) / 10
  );

  // Budget Deviations
  const budgetDeviations: FinancialMetrics['budgetDeviations'] = [];
  if (Array.isArray(categoriesWithBudgets)) {
    for (const cat of categoriesWithBudgets) {
      if (cat.budgetLimit > 0) {
        const actualSpent = roundCurrency(Math.max(0, categorySpentMap[cat.name] || 0));
        const diffPct = Math.round(
          ((actualSpent - cat.budgetLimit) / cat.budgetLimit) * 100
        );
        budgetDeviations.push({
          categoryName: cat.name,
          budgetLimit: cat.budgetLimit,
          actualSpent,
          diffPct,
          isOverBudget: actualSpent > cat.budgetLimit,
        });
      }
    }
  }

  budgetDeviations.sort((a, b) => b.diffPct - a.diffPct);

  const topCategories = Object.entries(categorySpentMap)
    .map(([category, amount]) => {
      const clampedAmount = roundCurrency(Math.max(0, amount));
      return {
        category,
        amount: clampedAmount,
        percentage:
          totalExpenses > 0
            ? Math.round((clampedAmount / totalExpenses) * 1000) / 10
            : 0,
      };
    })
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const top5Expenses = [...expenseItems]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Determine Maturity Level
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
    totalIncome,
    totalExpenses,
    netCashFlow,
    netSavings: netCashFlow,
    savingsRatePct,
    savingsRate,
    fixedExpenses,
    variableExpenses,
    investmentAmount,
    creditCardExpenses,
    cashExpenses,
    ignoredCount,
    transferCount,
    fixedPct,
    variablePct,
    investmentPct,
    runwayMonths,
    totalLiquidBalance,
    maturityLevel,
    budgetDeviations,
    topCategories,
    top5Expenses,
    monthlyComparison: {
      incomeChange,
      expenseChange,
    },
  };
}
