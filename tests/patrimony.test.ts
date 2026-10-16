import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { calculatePatrimonialSummary } from '../src/lib/patrimony-engine.ts';
import type {
  RawAccountInput,
  RawPatrimonialAssetInput,
  RawPatrimonialLiabilityInput
} from '../src/lib/patrimony-engine.ts';

// In-Memory SQLite Setup for Patrimonial Isolation
const createMemPatrimonyDb = async () => {
  const client = createClient({ url: ':memory:' });
  await client.execute('PRAGMA foreign_keys = ON;');

  await client.execute(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      currency_code TEXT NOT NULL DEFAULT 'BRL',
      pluggy_item_id TEXT,
      pluggy_account_id TEXT,
      institution_name TEXT,
      color TEXT DEFAULT '#3b82f6',
      updated_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE patrimonial_assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      current_value REAL NOT NULL DEFAULT 0,
      acquisition_value REAL,
      acquisition_date TEXT,
      valuation_date TEXT NOT NULL,
      liquidity TEXT NOT NULL DEFAULT 'MEDIUM',
      notes TEXT,
      data_source TEXT NOT NULL DEFAULT 'MANUAL',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE patrimonial_liabilities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      current_balance REAL NOT NULL DEFAULT 0,
      original_amount REAL,
      interest_rate REAL,
      start_date TEXT,
      due_date TEXT,
      installments_total INTEGER,
      installments_remaining INTEGER,
      monthly_payment REAL,
      creditor TEXT,
      notes TEXT,
      data_source TEXT NOT NULL DEFAULT 'MANUAL',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE patrimonial_snapshots (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL,
      total_assets REAL NOT NULL DEFAULT 0,
      total_liabilities REAL NOT NULL DEFAULT 0,
      net_worth REAL NOT NULL DEFAULT 0,
      liquid_assets REAL NOT NULL DEFAULT 0,
      invested_assets REAL NOT NULL DEFAULT 0,
      fixed_assets REAL NOT NULL DEFAULT 0,
      short_term_liabilities REAL NOT NULL DEFAULT 0,
      long_term_liabilities REAL NOT NULL DEFAULT 0,
      details_json TEXT,
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE UNIQUE INDEX patrimonial_snapshots_month_unique ON patrimonial_snapshots(month);
  `);

  return client;
};

describe('FinAI Sprint 3 — Consolidação Patrimonial, Ativos, Passivos e Patrimônio Líquido', () => {

  // Scenario 1: Correct Net Worth, Total Assets, Total Liabilities Calculation
  it('Scenario 1: Correctly calculates Net Worth = Total Assets - Total Liabilities', () => {
    const accounts: RawAccountInput[] = [
      { id: 'acc-c6', name: 'C6 Bank', type: 'CHECKING', balance: 5000.0, pluggyAccountId: 'p1' },
      { id: 'acc-inv', name: 'XP Custódia', type: 'INVESTMENT', balance: 50000.0, pluggyAccountId: 'p2' },
      { id: 'acc-card', name: 'C6 Carbon', type: 'CREDIT_CARD', balance: 2500.0, pluggyAccountId: 'p3' },
    ];

    const manualAssets: RawPatrimonialAssetInput[] = [
      { id: 'ast-1', name: 'Apartamento', category: 'REAL_ESTATE', currentValue: 450000.0 },
      { id: 'ast-2', name: 'Veículo', category: 'VEHICLE', currentValue: 80000.0 },
    ];

    const manualLiabilities: RawPatrimonialLiabilityInput[] = [
      { id: 'liab-1', name: 'Financiamento Imobiliário', category: 'REAL_ESTATE_MORTGAGE', currentBalance: 200000.0 },
    ];

    const summary = calculatePatrimonialSummary(accounts, manualAssets, manualLiabilities);

    // Total Assets = 5.000 (Caixa) + 50.000 (Investimentos) + 450.000 (Imóvel) + 80.000 (Veículo) = 585.000
    assert.strictEqual(summary.totalAssets, 585000.0);

    // Total Liabilities = 2.500 (Cartão de Crédito) + 200.000 (Financiamento) = 202.500
    assert.strictEqual(summary.totalLiabilities, 202500.0);

    // Net Worth = 585.000 - 202.500 = 382.500
    assert.strictEqual(summary.netWorth, 382500.0);
    assert.strictEqual(summary.liquidAssets, 5000.0);
    assert.strictEqual(summary.investedAssets, 50000.0);
    assert.strictEqual(summary.fixedAssets, 530000.0);
    assert.strictEqual(summary.shortTermLiabilities, 2500.0);
    assert.strictEqual(summary.longTermLiabilities, 200000.0);
  });

  // Scenario 2: Bank Accounts Counted Exactly Once
  it('Scenario 2: Ensures each bank account is counted strictly once without duplications', () => {
    const accounts: RawAccountInput[] = [
      { id: 'acc-1', name: 'C6 Checking', type: 'CHECKING', balance: 1200.0, pluggyAccountId: 'p-c6' },
      { id: 'acc-2', name: 'Itaú Checking', type: 'CHECKING', balance: 800.0, pluggyAccountId: 'p-itau' },
      { id: 'acc-3', name: 'Nubank Poupança', type: 'SAVINGS', balance: 3000.0, pluggyAccountId: 'p-nu' },
    ];

    const summary = calculatePatrimonialSummary(accounts, [], []);
    assert.strictEqual(summary.totalAssets, 5000.0);
    assert.strictEqual(summary.assetsList.length, 3);
    assert.strictEqual(summary.totalLiabilities, 0);
    assert.strictEqual(summary.netWorth, 5000.0);
  });

  // Scenario 3: Self-Transfers Do Not Alter Net Worth
  it('Scenario 3: Self-transfers between user accounts preserve total Net Worth and total assets', () => {
    // Before Transfer: C6 has 2000, Itaú has 1000. Total = 3000
    const beforeAccounts: RawAccountInput[] = [
      { id: 'acc-1', name: 'C6 Bank', type: 'CHECKING', balance: 2000.0 },
      { id: 'acc-2', name: 'Itaú', type: 'CHECKING', balance: 1000.0 },
    ];
    const beforeSummary = calculatePatrimonialSummary(beforeAccounts, [], []);
    assert.strictEqual(beforeSummary.totalAssets, 3000.0);
    assert.strictEqual(beforeSummary.netWorth, 3000.0);

    // User transfers R$ 500 from C6 to Itaú: C6 becomes 1500, Itaú becomes 1500
    const afterAccounts: RawAccountInput[] = [
      { id: 'acc-1', name: 'C6 Bank', type: 'CHECKING', balance: 1500.0 },
      { id: 'acc-2', name: 'Itaú', type: 'CHECKING', balance: 1500.0 },
    ];
    const afterSummary = calculatePatrimonialSummary(afterAccounts, [], []);
    assert.strictEqual(afterSummary.totalAssets, 3000.0);
    assert.strictEqual(afterSummary.netWorth, 3000.0);
  });

  // Scenario 4: Credit Card Purchases and Invoice Settlement Neutrality
  it('Scenario 4: Paying credit card invoice reduces cash and clears liability with zero net worth shock', () => {
    // Stage A: User has 5000 in Checking and 1500 invoice due on Credit Card
    const stageAAccounts: RawAccountInput[] = [
      { id: 'acc-check', name: 'Conta Corrente', type: 'CHECKING', balance: 5000.0 },
      { id: 'acc-card', name: 'Cartão de Crédito', type: 'CREDIT_CARD', balance: 1500.0 },
    ];
    const summaryA = calculatePatrimonialSummary(stageAAccounts, [], []);
    assert.strictEqual(summaryA.totalAssets, 5000.0);
    assert.strictEqual(summaryA.totalLiabilities, 1500.0);
    assert.strictEqual(summaryA.netWorth, 3500.0);

    // Stage B: Invoice paid from checking: checking balance is 3500, card liability is 0
    const stageBAccounts: RawAccountInput[] = [
      { id: 'acc-check', name: 'Conta Corrente', type: 'CHECKING', balance: 3500.0 },
      { id: 'acc-card', name: 'Cartão de Crédito', type: 'CREDIT_CARD', balance: 0 },
    ];
    const summaryB = calculatePatrimonialSummary(stageBAccounts, [], []);
    assert.strictEqual(summaryB.totalAssets, 3500.0);
    assert.strictEqual(summaryB.totalLiabilities, 0);
    assert.strictEqual(summaryB.netWorth, 3500.0); // Exact same Net Worth! No double counting!
  });

  // Scenario 5: Debt Principal Amortization
  it('Scenario 5: Principal amortization deterministically reduces manual liability and increases net worth', () => {
    const assets: RawPatrimonialAssetInput[] = [
      { id: 'ast-home', name: 'Imóvel', category: 'REAL_ESTATE', currentValue: 400000.0 },
    ];

    // Initial Debt: 250.000
    const initialDebt: RawPatrimonialLiabilityInput[] = [
      { id: 'liab-mort', name: 'Financiamento SFH', category: 'REAL_ESTATE_MORTGAGE', currentBalance: 250000.0 },
    ];
    const initialSummary = calculatePatrimonialSummary([], assets, initialDebt);
    assert.strictEqual(initialSummary.netWorth, 150000.0);

    // After 1 year of payments, principal amortized by 15.000 -> 235.000
    const amortizedDebt: RawPatrimonialLiabilityInput[] = [
      { id: 'liab-mort', name: 'Financiamento SFH', category: 'REAL_ESTATE_MORTGAGE', currentBalance: 235000.0 },
    ];
    const amortizedSummary = calculatePatrimonialSummary([], assets, amortizedDebt);
    assert.strictEqual(amortizedSummary.totalLiabilities, 235000.0);
    assert.strictEqual(amortizedSummary.netWorth, 165000.0);
  });

  // Scenario 6: Safe Handling of Missing, Negative or Malformed Values
  it('Scenario 6: Coerces null, undefined, strings with commas and invalid numbers safely without crashing', () => {
    const dirtyAccounts: RawAccountInput[] = [
      { id: 'a1', name: 'Conta 1', type: 'CHECKING', balance: null },
      { id: 'a2', name: 'Conta 2', type: 'CHECKING', balance: undefined },
      { id: 'a3', name: 'Conta 3', type: 'CHECKING', balance: NaN },
    ];

    const dirtyAssets: RawPatrimonialAssetInput[] = [
      { id: 'ast-1', name: 'Ativo com Vírgula', category: 'REAL_ESTATE', currentValue: '150000,50' as any },
      { id: 'ast-2', name: 'Ativo Nulo', category: 'VEHICLE', currentValue: null },
    ];

    const dirtyLiabilities: RawPatrimonialLiabilityInput[] = [
      { id: 'l1', name: 'Dívida Inválida', category: 'OTHER', currentBalance: 'abc' as any },
      { id: 'l2', name: 'Dívida Negativa Coerced', category: 'OTHER', currentBalance: -500 },
    ];

    const summary = calculatePatrimonialSummary(dirtyAccounts, dirtyAssets, dirtyLiabilities);
    assert.strictEqual(summary.totalAssets, 150000.50);
    // Negative balance coerced to 0 for liability
    assert.strictEqual(summary.totalLiabilities, 0);
    assert.strictEqual(summary.netWorth, 150000.50);
  });

  // Scenario 7: In-Memory DB CRUD of Manual Assets and Liabilities
  it('Scenario 7: Full SQLite in-memory persistence and mutation of assets and liabilities', async () => {
    const memDb = await createMemPatrimonyDb();

    // 1. Insert Asset
    const now = new Date().toISOString();
    await memDb.execute({
      sql: `INSERT INTO patrimonial_assets (id, name, category, current_value, valuation_date, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?);`,
      args: ['ast-test-1', 'Casa de Praia', 'REAL_ESTATE', 300000.0, '2026-10-15', now, now],
    });

    const assetRes1 = await memDb.execute("SELECT current_value FROM patrimonial_assets WHERE id = 'ast-test-1';");
    assert.strictEqual(assetRes1.rows[0].current_value, 300000.0);

    // 2. Update Asset Valuation
    await memDb.execute({
      sql: "UPDATE patrimonial_assets SET current_value = ? WHERE id = 'ast-test-1';",
      args: [350000.0],
    });
    const assetRes2 = await memDb.execute("SELECT current_value FROM patrimonial_assets WHERE id = 'ast-test-1';");
    assert.strictEqual(assetRes2.rows[0].current_value, 350000.0);

    // 3. Insert and Delete Liability
    await memDb.execute({
      sql: `INSERT INTO patrimonial_liabilities (id, name, category, current_balance, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?);`,
      args: ['liab-test-1', 'Empréstimo Amigo', 'PERSONAL_LOAN', 10000.0, now, now],
    });

    const liabCount1 = await memDb.execute('SELECT COUNT(*) as count FROM patrimonial_liabilities;');
    assert.strictEqual(liabCount1.rows[0].count, 1);

    await memDb.execute("DELETE FROM patrimonial_liabilities WHERE id = 'liab-test-1';");
    const liabCount2 = await memDb.execute('SELECT COUNT(*) as count FROM patrimonial_liabilities;');
    assert.strictEqual(liabCount2.rows[0].count, 0);
  });

  // Scenario 8: Referential Integrity and Unique Monthly Snapshots
  it('Scenario 8: Enforces unique monthly snapshot constraint preventing duplicate timeline entries', async () => {
    const memDb = await createMemPatrimonyDb();
    const now = new Date().toISOString();

    // Insert snapshot for 2026-10
    await memDb.execute({
      sql: `INSERT INTO patrimonial_snapshots (id, month, total_assets, total_liabilities, net_worth, created_at)
            VALUES (?, ?, ?, ?, ?, ?);`,
      args: ['snap-2026-10', '2026-10', 500000.0, 100000.0, 400000.0, now],
    });

    // Attempting duplicate insert for same month must throw UNIQUE constraint error
    await assert.rejects(async () => {
      await memDb.execute({
        sql: `INSERT INTO patrimonial_snapshots (id, month, total_assets, total_liabilities, net_worth, created_at)
              VALUES (?, ?, ?, ?, ?, ?);`,
        args: ['snap-2026-10-dup', '2026-10', 520000.0, 90000.0, 430000.0, now],
      });
    }, /UNIQUE constraint failed/);

    const countRes = await memDb.execute('SELECT COUNT(*) as count FROM patrimonial_snapshots;');
    assert.strictEqual(countRes.rows[0].count, 1);
  });

  // Scenario 9: Idempotent Open Finance Sync Without Duplicating Wealth
  it('Scenario 9: Re-syncing bank accounts updates reference balances without accumulating duplicate assets', () => {
    // Initial Sync: C6 has 1000, Itaú has 500
    const sync1: RawAccountInput[] = [
      { id: 'acc-1', name: 'C6 Bank', type: 'CHECKING', balance: 1000.0, pluggyAccountId: 'p1' },
      { id: 'acc-2', name: 'Itaú', type: 'CHECKING', balance: 500.0, pluggyAccountId: 'p2' },
    ];
    const summary1 = calculatePatrimonialSummary(sync1, [], []);
    assert.strictEqual(summary1.totalAssets, 1500.0);

    // Re-sync: Updated balances from bank (C6 has 1200, Itaú has 400)
    const sync2: RawAccountInput[] = [
      { id: 'acc-1', name: 'C6 Bank', type: 'CHECKING', balance: 1200.0, pluggyAccountId: 'p1' },
      { id: 'acc-2', name: 'Itaú', type: 'CHECKING', balance: 400.0, pluggyAccountId: 'p2' },
    ];
    const summary2 = calculatePatrimonialSummary(sync2, [], []);
    assert.strictEqual(summary2.totalAssets, 1600.0);
    assert.strictEqual(summary2.assetsList.length, 2);
  });

  // Scenario 10: Negative Checking Account (Overdraft / Cheque Especial) as Liability
  it('Scenario 10: Negative checking account is correctly classified as a short-term liability', () => {
    const accounts: RawAccountInput[] = [
      { id: 'acc-1', name: 'C6 Overdrawn', type: 'CHECKING', balance: -850.0 },
      { id: 'acc-2', name: 'Itaú Positive', type: 'CHECKING', balance: 2000.0 },
    ];

    const summary = calculatePatrimonialSummary(accounts, [], []);
    // Positive checking is asset
    assert.strictEqual(summary.totalAssets, 2000.0);
    assert.strictEqual(summary.liquidAssets, 2000.0);

    // Negative checking is short-term liability of 850
    assert.strictEqual(summary.totalLiabilities, 850.0);
    assert.strictEqual(summary.shortTermLiabilities, 850.0);

    // Net worth = 2000 - 850 = 1150
    assert.strictEqual(summary.netWorth, 1150.0);
  });

});
