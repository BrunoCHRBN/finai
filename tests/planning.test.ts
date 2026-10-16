import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import {
  prepareCanonicalTransactions,
  aggregatePeriodTransactions,
  calculateBudgetExecution,
  evaluateFinancialGoals,
  calculateCashFlowProjection,
  simulateSavingsScenarios,
  evaluatePlanningAlerts,
  buildConsultativePlanningSnapshot,
  roundCurrency,
  addMonths,
  monthsBetween,
} from '../src/lib/planning-engine.ts';
import type {
  PlanningTransactionInput,
  PlanningAccountInput,
  PlanningCategoryInput,
  PlanningBudgetRecordInput,
  PlanningGoalInput,
  RecurringFlowInput,
  PlanningLiabilityInput,
} from '../src/lib/planning-engine.ts';

// Helper to initialize an isolated in-memory SQLite database with Sprint 4 schema & FKs
const createMemPlanningDb = async () => {
  const client = createClient({ url: ':memory:' });
  await client.execute('PRAGMA foreign_keys = ON;');

  await client.execute(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      currency_code TEXT NOT NULL DEFAULT 'BRL',
      updated_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "group" TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#64748b',
      icon TEXT NOT NULL DEFAULT 'Tag',
      budget_limit REAL NOT NULL DEFAULT 0
    );
  `);

  await client.execute(`
    CREATE TABLE budgets (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT,
      planned_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      history_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT
    );
  `);

  await client.execute(`
    CREATE TABLE goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      purpose TEXT,
      target_amount REAL NOT NULL,
      current_amount REAL NOT NULL DEFAULT 0,
      planned_monthly_contribution REAL NOT NULL DEFAULT 0,
      deadline TEXT,
      category TEXT NOT NULL DEFAULT 'EMERGENCY',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      priority INTEGER NOT NULL DEFAULT 1,
      linked_account_id TEXT,
      color TEXT DEFAULT '#10b981',
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await client.execute(`
    CREATE TABLE recurring_flows (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      nature TEXT NOT NULL DEFAULT 'CONFIRMED',
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      amount REAL NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'MONTHLY',
      day_of_month INTEGER DEFAULT 5,
      start_month TEXT NOT NULL,
      end_month TEXT,
      total_installments INTEGER,
      remaining_installments INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE planning_alerts (
      id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      reason TEXT NOT NULL,
      period TEXT NOT NULL,
      foundation_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE planning_preferences (
      id TEXT PRIMARY KEY,
      min_liquidity_threshold REAL NOT NULL DEFAULT 1000,
      budget_warning_pct REAL NOT NULL DEFAULT 80,
      budget_critical_pct REAL NOT NULL DEFAULT 100,
      max_data_staleness_days INTEGER NOT NULL DEFAULT 7,
      liability_due_soon_days INTEGER NOT NULL DEFAULT 7,
      updated_at TEXT NOT NULL
    );
  `);

  return client;
};

describe('FinAI Sprint 4 — Planejamento Financeiro, Orçamentos, Metas e Projeções', () => {
  // 1. Cálculo de orçamento e percentual de execução
  it('1. Correctly calculates category budgets, execution percentage, remaining balance, unbudgeted categories, and closed budgets', () => {
    const accounts: PlanningAccountInput[] = [
      { id: 'acc-1', name: 'C6 Checking', type: 'CHECKING', balance: 5000 },
    ];
    const categories: PlanningCategoryInput[] = [
      { id: 'cat-moradia', name: 'Moradia', group: 'FIXED', budgetLimit: 2000 },
      { id: 'cat-mercado', name: 'Supermercado', group: 'FIXED', budgetLimit: 1000 },
      { id: 'cat-lazer', name: 'Lazer', group: 'VARIABLE', budgetLimit: 500 },
      { id: 'cat-outros', name: 'Outros', group: 'VARIABLE', budgetLimit: 0 }, // Unbudgeted
      { id: 'cat-assinaturas', name: 'Assinaturas', group: 'VARIABLE', budgetLimit: 200 },
    ];
    const periodBudgets: PlanningBudgetRecordInput[] = [
      { id: 'b-1', month: '2026-10', categoryId: 'cat-moradia', plannedAmount: 2000, status: 'ACTIVE' },
      { id: 'b-2', month: '2026-10', categoryId: 'cat-mercado', plannedAmount: 1000, status: 'ACTIVE' },
      { id: 'b-3', month: '2026-10', categoryId: 'cat-lazer', plannedAmount: 500, status: 'ACTIVE' },
      { id: 'b-4', month: '2026-10', categoryId: 'cat-assinaturas', plannedAmount: 200, status: 'CLOSED' },
    ];
    const rawTxs: PlanningTransactionInput[] = [
      { id: 'tx-1', accountId: 'acc-1', categoryId: 'cat-moradia', amount: -1600, date: '2026-10-05', type: 'DEBIT' }, // 80% -> NEAR_LIMIT
      { id: 'tx-2', accountId: 'acc-1', categoryId: 'cat-mercado', amount: -450, date: '2026-10-10', type: 'DEBIT' }, // 45% -> WITHIN_LIMIT
      { id: 'tx-3', accountId: 'acc-1', categoryId: 'cat-lazer', amount: -650, date: '2026-10-12', type: 'DEBIT' }, // 130% -> OVER_BUDGET
      { id: 'tx-4', accountId: 'acc-1', categoryId: 'cat-outros', amount: -120, date: '2026-10-14', type: 'DEBIT' }, // UNBUDGETED
    ];

    const reconciled = prepareCanonicalTransactions(rawTxs, accounts);
    const summary = calculateBudgetExecution('2026-10', categories, periodBudgets, reconciled);

    assert.strictEqual(summary.hasMovementsInPeriod, true);
    // Active planned = 2000 + 1000 + 500 = 3500 (cat-assinaturas is CLOSED, cat-outros is 0)
    assert.strictEqual(summary.totalPlanned, 3500);
    // Budgeted realized spent = 1600 + 450 + 650 = 2700
    assert.strictEqual(summary.totalBudgetedRealizedSpent, 2700);
    // Unbudgeted spent = 120
    assert.strictEqual(summary.totalUnbudgetedSpent, 120);
    // Total realized expenses = 2820
    assert.strictEqual(summary.totalRealizedExpenses, 2820);
    // Remaining on budgeted = 3500 - 2700 = 800
    assert.strictEqual(summary.totalRemainingBalance, 800);
    assert.strictEqual(summary.globalExecutionPct, roundCurrency((2700 / 3500) * 100));

    const moradia = summary.items.find((i) => i.categoryId === 'cat-moradia')!;
    assert.strictEqual(moradia.executionPct, 80);
    assert.strictEqual(moradia.indicator, 'NEAR_LIMIT');

    const lazer = summary.items.find((i) => i.categoryId === 'cat-lazer')!;
    assert.strictEqual(lazer.executionPct, 130);
    assert.strictEqual(lazer.remainingBalance, -150);
    assert.strictEqual(lazer.indicator, 'OVER_BUDGET');

    const outros = summary.items.find((i) => i.categoryId === 'cat-outros')!;
    assert.strictEqual(outros.indicator, 'UNBUDGETED');

    const assinaturas = summary.items.find((i) => i.categoryId === 'cat-assinaturas')!;
    assert.strictEqual(assinaturas.indicator, 'CLOSED');
  });

  // 2. Exclusão de transferências próprias das despesas e receitas
  it('2. Excludes self-transfers between user own accounts from operating incomes, expenses, and budgets', () => {
    const accounts: PlanningAccountInput[] = [
      { id: 'acc-c6', name: 'C6', type: 'CHECKING', balance: 2000 },
      { id: 'acc-itau', name: 'Itaú', type: 'CHECKING', balance: 1500 },
    ];
    const rawTxs: PlanningTransactionInput[] = [
      { id: 'tx-sal', accountId: 'acc-c6', amount: 6000, date: '2026-10-05', type: 'CREDIT', description: 'Salário' },
      // Self-transfer of R$ 1500 from C6 to Itaú on same day
      { id: 'tx-tr-out', accountId: 'acc-c6', amount: -1500, date: '2026-10-06', type: 'DEBIT', description: 'Pix para Itaú' },
      { id: 'tx-tr-in', accountId: 'acc-itau', amount: 1500, date: '2026-10-06', type: 'CREDIT', description: 'Pix de C6' },
      // Explicit TRANSFER transaction
      { id: 'tx-tr-exp', accountId: 'acc-c6', amount: -400, date: '2026-10-08', type: 'TRANSFER', description: 'Transferência' },
      // Real expense
      { id: 'tx-exp', accountId: 'acc-itau', categoryId: 'cat-1', amount: -300, date: '2026-10-10', type: 'DEBIT', description: 'Mercado' },
    ];

    const reconciled = prepareCanonicalTransactions(rawTxs, accounts);
    const agg = aggregatePeriodTransactions(reconciled, '2026-10');

    assert.strictEqual(agg.realizedIncome, 6000);
    assert.strictEqual(agg.realizedExpenses, 300);
    assert.strictEqual(agg.realizedNetCashFlow, 5700);
    assert.strictEqual(agg.transferTransactionCount, 3);
  });

  // 3. Tratamento de transações ignoradas
  it('3. Completely excludes ignored transactions (isIgnored = 1) from period totals and budget execution', () => {
    const accounts: PlanningAccountInput[] = [{ id: 'acc-1', name: 'C6', type: 'CHECKING', balance: 1000 }];
    const categories: PlanningCategoryInput[] = [{ id: 'cat-1', name: 'Lazer', group: 'VARIABLE', budgetLimit: 500 }];
    const rawTxs: PlanningTransactionInput[] = [
      { id: 'tx-1', accountId: 'acc-1', categoryId: 'cat-1', amount: -200, date: '2026-10-05', type: 'DEBIT', isIgnored: 0 },
      { id: 'tx-2', accountId: 'acc-1', categoryId: 'cat-1', amount: -900, date: '2026-10-06', type: 'DEBIT', isIgnored: 1 }, // Ignored!
      { id: 'tx-3', accountId: 'acc-1', amount: 5000, date: '2026-10-07', type: 'CREDIT', isIgnored: true }, // Ignored income!
    ];

    const reconciled = prepareCanonicalTransactions(rawTxs, accounts);
    const agg = aggregatePeriodTransactions(reconciled, '2026-10');
    const budgetExec = calculateBudgetExecution('2026-10', categories, [], reconciled);

    assert.strictEqual(agg.realizedIncome, 0);
    assert.strictEqual(agg.realizedExpenses, 200);
    assert.strictEqual(agg.ignoredTransactionCount, 2);
    assert.strictEqual(budgetExec.totalRealizedExpenses, 200);
    assert.strictEqual(budgetExec.items[0].executionPct, 40);
  });

  // 4. Compras de cartão e pagamentos de fatura sem dupla contagem
  it('4. Counts credit card purchases once and prevents double counting on invoice settlement or cash flow projection', () => {
    const accounts: PlanningAccountInput[] = [
      { id: 'acc-check', name: 'Conta Corrente', type: 'CHECKING', balance: 4000 },
      { id: 'acc-card', name: 'Cartão C6 Carbon', type: 'CREDIT_CARD', balance: 850 }, // 600 from Oct purchases + 250 prior unpaid
    ];
    const categories: PlanningCategoryInput[] = [
      { id: 'cat-rest', name: 'Restaurantes', group: 'VARIABLE', budgetLimit: 1000 },
    ];
    const rawTxs: PlanningTransactionInput[] = [
      // Individual purchase on credit card (Open Finance sends positive amount with type DEBIT)
      { id: 'tx-card-1', accountId: 'acc-card', categoryId: 'cat-rest', amount: 600, date: '2026-10-04', type: 'DEBIT', description: 'Restaurante Coco Bambu' },
      // Invoice payment from checking account in the same period
      { id: 'tx-inv-pay', accountId: 'acc-check', categoryId: 'cat-rest', amount: -1200, date: '2026-10-10', type: 'DEBIT', description: 'PAGAMENTO FATURA CARTAO C6' },
    ];

    const reconciled = prepareCanonicalTransactions(rawTxs, accounts);
    const budgetExec = calculateBudgetExecution('2026-10', categories, [], reconciled);

    // Only the R$ 600 purchase is counted as realized expense; the R$ 1200 invoice payment is converted to TRANSFER
    assert.strictEqual(budgetExec.totalRealizedExpenses, 600);
    assert.strictEqual(budgetExec.items[0].realizedSpent, 600);

    // In cash flow projection, priorUnsettledCardDebt = max(0, 850 - 600) = 250 (no double counting of the R$ 600 purchase!)
    const projection = calculateCashFlowProjection({
      referenceMonth: '2026-10',
      horizonMonths: 2,
      accounts,
      reconciledTransactions: reconciled,
      recurringFlows: [],
      liabilities: [],
      goals: [],
    });

    assert.strictEqual(projection.priorUnsettledCardDebt, 250);
    assert.strictEqual(projection.months[1].confirmed.priorUnsettledCardInvoice, 250);
  });

  // 5. Metas com e sem data-alvo e regra anti-dupla contagem de saldo
  it('5. Evaluates goals with and without target dates and prevents counting the same real balance in two goals simultaneously', () => {
    const accounts: PlanningAccountInput[] = [
      { id: 'acc-1', name: 'C6 Checking', type: 'CHECKING', balance: 3000 },
      { id: 'acc-2', name: 'CDB Liquidez', type: 'INVESTMENT', balance: 7000 },
      { id: 'acc-card', name: 'Cartão', type: 'CREDIT_CARD', balance: 1500 }, // Never counted as reserve!
    ];
    // Total verified reserve = 3000 + 7000 = 10000
    const goals: PlanningGoalInput[] = [
      {
        id: 'g-1',
        title: 'Reserva de Emergência',
        targetAmount: 16000,
        currentAmount: 7000, // Uses 7000 of 10000 available
        plannedMonthlyContribution: 1000,
        deadline: '2027-04', // 6 months from 2026-10 -> requires (16000-7000)/6 = 1500/m -> AT_RISK
        priority: 1,
        status: 'ACTIVE',
      },
      {
        id: 'g-2',
        title: 'Troca de Notebook',
        targetAmount: 8000,
        currentAmount: 5000, // Declares 5000, but only 3000 real reserve remains!
        plannedMonthlyContribution: 500,
        deadline: null, // Without deadline
        priority: 2,
        status: 'ACTIVE',
      },
    ];

    const summary = evaluateFinancialGoals(goals, accounts, '2026-10');

    assert.strictEqual(summary.verifiedAvailableReserve, 10000);
    assert.strictEqual(summary.totalDeclaredCurrentAmount, 12000);
    // Strictly capped at 10000 real balance!
    assert.strictEqual(summary.totalBackedByRealBalance, 10000);
    assert.strictEqual(summary.totalUnbackedGoalAmount, 2000);
    assert.strictEqual(summary.isReserveOverAllocated, true);

    const g1 = summary.goals.find((g) => g.id === 'g-1')!;
    assert.strictEqual(g1.backedByRealBalance, 7000);
    assert.strictEqual(g1.unbackedAmount, 0);
    assert.strictEqual(g1.monthsRemaining, 6);
    assert.strictEqual(g1.requiredMonthlyContribution, 1500);
    assert.strictEqual(g1.feasibility, 'AT_RISK');
    assert.strictEqual(g1.estimatedMonthsToComplete, 9);
    assert.strictEqual(g1.estimatedCompletionMonth, '2027-07');

    const g2 = summary.goals.find((g) => g.id === 'g-2')!;
    assert.strictEqual(g2.backedByRealBalance, 3000); // Only remaining 3000 backed!
    assert.strictEqual(g2.unbackedAmount, 2000);
    assert.strictEqual(g2.requiredMonthlyContribution, null);
    assert.strictEqual(g2.feasibility, 'NO_DEADLINE');
    assert.strictEqual(g2.estimatedMonthsToComplete, 6); // (8000 - 5000) / 500 = 6 months
  });

  // 6 & 7. Projeções com receitas e despesas recorrentes e separação entre realizados, programados e estimados
  it('6 & 7. Projects cash flow with recurring items, liabilities, and goals while strictly separating REALIZED, CONFIRMED, and ESTIMATED values', () => {
    const accounts: PlanningAccountInput[] = [
      { id: 'acc-1', name: 'Conta Principal', type: 'CHECKING', balance: 5000 },
    ];
    const rawTxs: PlanningTransactionInput[] = [
      { id: 'tx-1', accountId: 'acc-1', amount: 8000, date: '2026-10-05', type: 'CREDIT' },
      { id: 'tx-2', accountId: 'acc-1', amount: -3000, date: '2026-10-10', type: 'DEBIT' },
    ];
    const recurringFlows: RecurringFlowInput[] = [
      { id: 'rf-sal', title: 'Salário Base', type: 'INCOME', nature: 'CONFIRMED', amount: 8000, frequency: 'MONTHLY', startMonth: '2026-10' },
      { id: 'rf-rent', title: 'Aluguel Contrato', type: 'EXPENSE', nature: 'CONFIRMED', amount: 2500, frequency: 'MONTHLY', startMonth: '2026-10' },
      { id: 'rf-bonus', title: 'Freelance Hipotético', type: 'INCOME', nature: 'ESTIMATED', amount: 1200, frequency: 'MONTHLY', startMonth: '2026-10' },
      { id: 'rf-var', title: 'Gasto Variável Estimado', type: 'EXPENSE', nature: 'ESTIMATED', amount: 1500, frequency: 'MONTHLY', startMonth: '2026-10' },
    ];
    const liabilities: PlanningLiabilityInput[] = [
      { id: 'liab-1', name: 'Empréstimo Curto', category: 'PERSONAL_LOAN', currentBalance: 1000, monthlyPayment: 600, installmentsRemaining: 2 },
    ];
    const goals: PlanningGoalInput[] = [
      { id: 'goal-1', title: 'Meta Curta', targetAmount: 5000, currentAmount: 4200, plannedMonthlyContribution: 500, status: 'ACTIVE' },
    ];

    const reconciled = prepareCanonicalTransactions(rawTxs, accounts);
    const proj = calculateCashFlowProjection({
      referenceMonth: '2026-10',
      horizonMonths: 3,
      accounts,
      reconciledTransactions: reconciled,
      recurringFlows,
      liabilities,
      goals,
    });

    // Month 0 (2026-10): Realized inflows = 8000, outflows = 3000, net = +5000; opening/closing liquid = 5000
    assert.strictEqual(proj.months[0].month, '2026-10');
    assert.strictEqual(proj.months[0].realized.inflows, 8000);
    assert.strictEqual(proj.months[0].realized.outflows, 3000);
    assert.strictEqual(proj.months[0].realized.net, 5000);
    assert.strictEqual(proj.months[0].closingConfirmedBalance, 5000);

    // Month 1 (2026-11):
    // Confirmed inflows = 8000
    // Confirmed outflows = 2500 (rent) + 600 (liability installment 1) + 500 (goal contribution 1) = 3600
    // Confirmed net = +4400 -> closingConfirmedBalance = 5000 + 4400 = 9400
    // Estimated net = 1200 - 1500 = -300 -> closingTotalProjectedBalance = 9400 - 300 = 9100
    const m1 = proj.months[1];
    assert.strictEqual(m1.month, '2026-11');
    assert.strictEqual(m1.realized.inflows, 0);
    assert.strictEqual(m1.confirmed.totalInflows, 8000);
    assert.strictEqual(m1.confirmed.liabilityInstallments, 600);
    assert.strictEqual(m1.confirmed.goalContributions, 500);
    assert.strictEqual(m1.confirmed.totalOutflows, 3600);
    assert.strictEqual(m1.confirmed.net, 4400);
    assert.strictEqual(m1.estimated.inflows, 1200);
    assert.strictEqual(m1.estimated.outflows, 1500);
    assert.strictEqual(m1.estimated.net, -300);
    assert.strictEqual(m1.closingConfirmedBalance, 9400);
    assert.strictEqual(m1.closingTotalProjectedBalance, 9100);

    // Month 2 (2026-12):
    // Liability has only 400 remaining balance (1000 - 600 = 400), so installment is capped at 400!
    // Goal has only 300 remaining to target (800 - 500 = 300), so contribution is capped at 300!
    const m2 = proj.months[2];
    assert.strictEqual(m2.confirmed.liabilityInstallments, 400);
    assert.strictEqual(m2.confirmed.goalContributions, 300);

    // Month 3 (2027-01): Both liability and goal are now fully paid/completed (0 outflow)!
    const m3 = proj.months[3];
    assert.strictEqual(m3.confirmed.liabilityInstallments, 0);
    assert.strictEqual(m3.confirmed.goalContributions, 0);
  });

  // 8. Cenários de poupança, taxas e horizontes distintos
  it('8. Simulates deterministic savings scenarios across different rates, horizons, and inflation (Nominal vs Real)', () => {
    const simShort = simulateSavingsScenarios({
      initialCapital: 10000,
      monthlyContribution: 1000,
      horizonMonths: 12,
      annualNominalReturnPct: 12.0,
      annualInflationPct: 4.5,
      desiredMonthlyIncome: 3000,
      safeWithdrawalRatePct: 4.0,
    });

    const simLong = simulateSavingsScenarios({
      initialCapital: 10000,
      monthlyContribution: 1000,
      horizonMonths: 120,
      annualNominalReturnPct: 12.0,
      annualInflationPct: 4.5,
      desiredMonthlyIncome: 3000,
      safeWithdrawalRatePct: 4.0,
    });

    assert.strictEqual(simShort.isValid, true);
    assert.strictEqual(simLong.isValid, true);
    assert.strictEqual(simShort.baseResult.totalContributed, 22000);
    assert.strictEqual(simLong.baseResult.totalContributed, 130000);

    // Nominal balance must be greater than Real balance when inflation > 0
    assert.ok(simLong.baseResult.finalNominalBalance > simLong.baseResult.finalRealBalance);
    // Longer horizon with positive real return yields strictly larger real balance
    assert.ok(simLong.baseResult.finalRealBalance > simShort.baseResult.finalRealBalance);

    // Scenarios order: Conservative < Base < Optimistic
    const [cons, base, opt] = simLong.scenarios;
    assert.ok(cons.finalRealBalance < base.finalRealBalance);
    assert.ok(base.finalRealBalance < opt.finalRealBalance);

    // Financial Independence required capital at 4% a.a. for R$ 3000/month = (3000 * 12) / 0.04 = R$ 900,000
    assert.strictEqual(simLong.financialIndependence.requiredCapitalAtConfiguredRate, 900000);
    assert.ok(simLong.financialIndependence.withdrawalSensitivity.length >= 4);
  });

  // 9. Tratamento de dados ausentes e hipóteses inválidas
  it('9. Safely handles missing data, empty periods, and rejects invalid simulation hypotheses without crashing', () => {
    // Empty period with no transactions
    const emptyBudget = calculateBudgetExecution('2026-11', [], [], []);
    assert.strictEqual(emptyBudget.hasMovementsInPeriod, false);
    assert.strictEqual(emptyBudget.totalPlanned, 0);
    assert.strictEqual(emptyBudget.totalRealizedExpenses, 0);

    // Invalid simulation inputs
    const invalidSim = simulateSavingsScenarios({
      initialCapital: -500,
      monthlyContribution: -100,
      horizonMonths: 0,
      annualNominalReturnPct: 250,
      annualInflationPct: -50,
      desiredMonthlyIncome: -1000,
      safeWithdrawalRatePct: 0,
    });

    assert.strictEqual(invalidSim.isValid, false);
    assert.ok(invalidSim.validationErrors.length >= 5);
  });

  // 10. Geração e supressão de alertas conforme os limites configurados
  it('10. Generates traceable deterministic alerts and respects threshold changes and fingerprint deduplication', () => {
    const accounts: PlanningAccountInput[] = [
      { id: 'acc-1', name: 'C6 Bank', type: 'CHECKING', balance: 400, updatedAt: '2026-09-01T10:00:00Z' },
    ];
    const categories: PlanningCategoryInput[] = [
      { id: 'cat-1', name: 'Restaurantes', group: 'VARIABLE', budgetLimit: 500 },
    ];
    const rawTxs: PlanningTransactionInput[] = [
      { id: 'tx-1', accountId: 'acc-1', categoryId: 'cat-1', amount: -550, date: '2026-10-10', type: 'DEBIT' },
    ];
    const goals: PlanningGoalInput[] = [
      { id: 'g-1', title: 'Reserva', targetAmount: 10000, currentAmount: 1000, plannedMonthlyContribution: 100, deadline: '2026-12', status: 'ACTIVE' },
    ];
    const liabilities: PlanningLiabilityInput[] = [
      { id: 'l-1', name: 'IPVA Parcela Final', category: 'TAX_DEBT', currentBalance: 800, dueDate: '2026-10-18' },
    ];

    const reconciled = prepareCanonicalTransactions(rawTxs, accounts);
    const budgetSummary = calculateBudgetExecution('2026-10', categories, [], reconciled);
    const goalsSummary = evaluateFinancialGoals(goals, accounts, '2026-10');
    const cashFlowProjection = calculateCashFlowProjection({
      referenceMonth: '2026-10',
      horizonMonths: 3,
      accounts,
      reconciledTransactions: reconciled,
      recurringFlows: [],
      liabilities,
      goals,
      minLiquidityThreshold: 1000,
    });

    const alerts = evaluatePlanningAlerts({
      referenceMonth: '2026-10',
      referenceDateISO: '2026-10-15',
      budgetSummary,
      goalsSummary,
      cashFlowProjection,
      accounts,
      liabilities,
      preferences: {
        minLiquidityThreshold: 1000,
        budgetWarningPct: 80,
        budgetCriticalPct: 100,
        maxDataStalenessDays: 7,
        liabilityDueSoonDays: 7,
      },
    });

    const types = new Set(alerts.map((a) => a.type));
    assert.ok(types.has('LOW_PROJECTED_LIQUIDITY'));
    assert.ok(types.has('BUDGET_EXCEEDED'));
    assert.ok(types.has('GOAL_AT_RISK'));
    assert.ok(types.has('GOAL_OVERALLOCATION'));
    assert.ok(types.has('LIABILITY_DUE_SOON'));
    assert.ok(types.has('STALE_FINANCIAL_DATA'));

    // Every alert has traceable foundationData and unique fingerprint
    const fingerprints = new Set(alerts.map((a) => a.fingerprint));
    assert.strictEqual(fingerprints.size, alerts.length);
  });

  // 11. Persistência, validação e integridade das novas entidades
  it('11. Persists and validates budgets, goals, recurring flows, and deduplicated alerts in SQLite without altering bank balances', async () => {
    const db = await createMemPlanningDb();
    const now = '2026-10-15T12:00:00.000Z';

    await db.execute({
      sql: 'INSERT INTO accounts (id, name, type, balance, updated_at) VALUES (?, ?, ?, ?, ?)',
      args: ['acc-main', 'C6 Bank', 'CHECKING', 2500.0, now],
    });

    await db.execute({
      sql: 'INSERT INTO categories (id, name, "group", budget_limit) VALUES (?, ?, ?, ?)',
      args: ['cat-food', 'Alimentação', 'FIXED', 1200.0],
    });

    // 1. Insert period budget with history & status
    const historyJson = JSON.stringify([
      { timestamp: now, previousAmount: 1200, newAmount: 1500, note: 'Ajuste inflação' },
    ]);
    await db.execute({
      sql: 'INSERT INTO budgets (id, month, category_id, name, planned_amount, status, history_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: ['b-2026-10-food', '2026-10', 'cat-food', 'Alimentação Outubro', 1500.0, 'ACTIVE', historyJson, now],
    });

    // 2. Insert, update, and delete Goal — verifying account balance stays untouched
    await db.execute({
      sql: 'INSERT INTO goals (id, title, purpose, target_amount, current_amount, planned_monthly_contribution, deadline, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: ['goal-1', 'Reserva', 'Segurança familiar', 15000.0, 2500.0, 800.0, '2027-12', 'ACTIVE', 1, now, now],
    });

    await db.execute({
      sql: 'UPDATE goals SET current_amount = ?, status = ? WHERE id = ?',
      args: [3500.0, 'PAUSED', 'goal-1'],
    });

    await db.execute("DELETE FROM goals WHERE id = 'goal-1'");

    const accCheck = await db.execute("SELECT balance FROM accounts WHERE id = 'acc-main'");
    assert.strictEqual(accCheck.rows[0].balance, 2500.0); // Untouched!

    // 3. Insert Recurring Flow
    await db.execute({
      sql: 'INSERT INTO recurring_flows (id, title, type, nature, category_id, amount, frequency, start_month, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: ['rf-1', 'Salário', 'INCOME', 'CONFIRMED', null, 7500.0, 'MONTHLY', '2026-10', now, now],
    });

    // 4. Alert unique fingerprint enforcement (prevents duplicate alerts)
    await db.execute({
      sql: 'INSERT INTO planning_alerts (id, fingerprint, type, severity, title, reason, period, foundation_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: ['al-1', 'BUDGET_EXCEEDED:cat-food:2026-10', 'BUDGET_EXCEEDED', 'CRITICAL', 'Teto excedido', 'Motivo', '2026-10', '{}', 'DISMISSED', now, now],
    });

    await assert.rejects(async () => {
      await db.execute({
        sql: 'INSERT INTO planning_alerts (id, fingerprint, type, severity, title, reason, period, foundation_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: ['al-2', 'BUDGET_EXCEEDED:cat-food:2026-10', 'BUDGET_EXCEEDED', 'CRITICAL', 'Duplicado', 'Motivo', '2026-10', '{}', 'ACTIVE', now, now],
      });
    }, /UNIQUE constraint failed/);
  });

  // 12. Consultative AI Snapshot & Helper Utilities Verification
  it('12. Generates sanitized consultative snapshot for future AI usage without exposing credentials', () => {
    assert.strictEqual(addMonths('2026-10', 3), '2027-01');
    assert.strictEqual(monthsBetween('2026-10', '2027-04-15'), 6);

    const budgetSummary = calculateBudgetExecution('2026-10', [], [], []);
    const goalsSummary = evaluateFinancialGoals([], [], '2026-10');
    const cashFlowProjection = calculateCashFlowProjection({
      referenceMonth: '2026-10',
      horizonMonths: 3,
      accounts: [],
      reconciledTransactions: [],
      recurringFlows: [],
      liabilities: [],
      goals: [],
    });

    const snap = buildConsultativePlanningSnapshot({
      referenceMonth: '2026-10',
      budgetSummary,
      goalsSummary,
      cashFlowProjection,
      alerts: [],
    });

    assert.strictEqual(snap.period, '2026-10');
    assert.strictEqual(snap.cashFlowSummary.horizonMonths, 3);
  });
});
