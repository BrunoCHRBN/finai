import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import path from 'path';

// Use local SQLite file by default, or Turso / Cloud URL if DATABASE_URL is set
const dbUrl = process.env.DATABASE_URL || `file:${path.join(process.cwd(), 'finai.db')}`;
const dbAuthToken = process.env.DATABASE_AUTH_TOKEN;

export const client = createClient({
  url: dbUrl,
  authToken: dbAuthToken,
});

export const db = drizzle(client, { schema });

// Auto-initialize tables, foreign keys, migrations and default categories/seed data
let initialized = false;

export async function ensureDbInitialized() {
  if (initialized) return;

  // 1. Enforce SQLite Referential Integrity (PRAGMA foreign_keys = ON)
  await client.execute('PRAGMA foreign_keys = ON;');

  // 2. Create tables with Foreign Key constraints and appropriate indexes
  await client.execute(`
    CREATE TABLE IF NOT EXISTS accounts (
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
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "group" TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#64748b',
      icon TEXT NOT NULL DEFAULT 'Tag',
      budget_limit REAL NOT NULL DEFAULT 0
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SETTLED',
      pluggy_transaction_id TEXT,
      transfer_id TEXT,
      is_ignored INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS budgets (
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
    CREATE TABLE IF NOT EXISTS goals (
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
    CREATE TABLE IF NOT EXISTS ai_diagnostics (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL,
      maturity_level INTEGER NOT NULL DEFAULT 1,
      summary TEXT NOT NULL,
      synthetic_snapshot TEXT NOT NULL,
      actionable_steps TEXT NOT NULL,
      savings_rate REAL NOT NULL DEFAULT 0,
      burn_rate REAL NOT NULL DEFAULT 0,
      runway_months REAL NOT NULL DEFAULT 0,
      token_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS sync_locks (
      key TEXT PRIMARY KEY,
      acquired_at TEXT NOT NULL,
      status TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      status TEXT NOT NULL,
      accounts_synced INTEGER NOT NULL DEFAULT 0,
      transactions_new INTEGER NOT NULL DEFAULT 0,
      transactions_updated INTEGER NOT NULL DEFAULT 0,
      transactions_ignored INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS patrimonial_assets (
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
    CREATE TABLE IF NOT EXISTS patrimonial_liabilities (
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
    CREATE TABLE IF NOT EXISTS patrimonial_snapshots (
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
    CREATE TABLE IF NOT EXISTS recurring_flows (
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
    CREATE TABLE IF NOT EXISTS planning_alerts (
      id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL,
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
    CREATE TABLE IF NOT EXISTS planning_preferences (
      id TEXT PRIMARY KEY,
      min_liquidity_threshold REAL NOT NULL DEFAULT 1000,
      budget_warning_pct REAL NOT NULL DEFAULT 80,
      budget_critical_pct REAL NOT NULL DEFAULT 100,
      max_data_staleness_days INTEGER NOT NULL DEFAULT 7,
      liability_due_soon_days INTEGER NOT NULL DEFAULT 7,
      updated_at TEXT NOT NULL
    );
  `);

  // 3. Check if existing transactions table needs schema evolution (transfer_id & foreign keys)
  const columnsRes = await client.execute('PRAGMA table_info(transactions);');
  const existingColumns = new Set(columnsRes.rows.map((r: any) => r.name));

  if (!existingColumns.has('transfer_id')) {
    // Perform non-destructive atomic migration to add transfer_id and enforce FKs
    await client.batch([
      'PRAGMA foreign_keys = OFF;',
      `CREATE TABLE IF NOT EXISTS transactions_v2 (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'SETTLED',
        pluggy_transaction_id TEXT,
        transfer_id TEXT,
        is_ignored INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );`,
      `INSERT INTO transactions_v2 (id, account_id, category_id, description, amount, date, type, status, pluggy_transaction_id, transfer_id, is_ignored, created_at)
       SELECT id, account_id, category_id, description, amount, date, type, status, pluggy_transaction_id, NULL, is_ignored, created_at FROM transactions;`,
      'DROP TABLE transactions;',
      'ALTER TABLE transactions_v2 RENAME TO transactions;',
      'PRAGMA foreign_keys = ON;',
    ], 'write');
  }

  // 3b. Non-destructive schema evolution for budgets (Sprint 4)
  const budgetColsRes = await client.execute('PRAGMA table_info(budgets);');
  const budgetCols = new Set(budgetColsRes.rows.map((r: any) => r.name));
  if (!budgetCols.has('name')) {
    await client.execute('ALTER TABLE budgets ADD COLUMN name TEXT;');
  }
  if (!budgetCols.has('status')) {
    await client.execute("ALTER TABLE budgets ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';");
  }
  if (!budgetCols.has('history_json')) {
    await client.execute("ALTER TABLE budgets ADD COLUMN history_json TEXT NOT NULL DEFAULT '[]';");
  }
  if (!budgetCols.has('updated_at')) {
    await client.execute('ALTER TABLE budgets ADD COLUMN updated_at TEXT;');
  }

  // 3c. Non-destructive schema evolution for goals (Sprint 4)
  const goalColsRes = await client.execute('PRAGMA table_info(goals);');
  const goalCols = new Set(goalColsRes.rows.map((r: any) => r.name));
  if (!goalCols.has('purpose')) {
    await client.execute('ALTER TABLE goals ADD COLUMN purpose TEXT;');
  }
  if (!goalCols.has('planned_monthly_contribution')) {
    await client.execute('ALTER TABLE goals ADD COLUMN planned_monthly_contribution REAL NOT NULL DEFAULT 0;');
  }
  if (!goalCols.has('status')) {
    await client.execute("ALTER TABLE goals ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';");
  }
  if (!goalCols.has('priority')) {
    await client.execute('ALTER TABLE goals ADD COLUMN priority INTEGER NOT NULL DEFAULT 1;');
  }
  if (!goalCols.has('linked_account_id')) {
    await client.execute('ALTER TABLE goals ADD COLUMN linked_account_id TEXT;');
  }
  if (!goalCols.has('created_at')) {
    await client.execute('ALTER TABLE goals ADD COLUMN created_at TEXT;');
  }
  if (!goalCols.has('updated_at')) {
    await client.execute('ALTER TABLE goals ADD COLUMN updated_at TEXT;');
  }

  // 4. Create required indexes and unique constraints for idempotent synchronization
  await client.execute('CREATE INDEX IF NOT EXISTS transactions_account_id_idx ON transactions(account_id);');
  await client.execute('CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date);');
  await client.execute('CREATE INDEX IF NOT EXISTS transactions_category_id_idx ON transactions(category_id);');
  await client.execute('CREATE INDEX IF NOT EXISTS transactions_type_idx ON transactions(type);');
  await client.execute('CREATE INDEX IF NOT EXISTS transactions_is_ignored_idx ON transactions(is_ignored);');
  await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS transactions_pluggy_tx_id_unique ON transactions(pluggy_transaction_id) WHERE pluggy_transaction_id IS NOT NULL;');
  await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS accounts_pluggy_acc_id_unique ON accounts(pluggy_account_id) WHERE pluggy_account_id IS NOT NULL;');
  await client.execute('CREATE INDEX IF NOT EXISTS accounts_pluggy_item_id_idx ON accounts(pluggy_item_id);');
  await client.execute('CREATE INDEX IF NOT EXISTS budgets_month_category_idx ON budgets(month, category_id);');
  await client.execute('CREATE INDEX IF NOT EXISTS sync_logs_item_id_idx ON sync_logs(item_id, started_at);');
  await client.execute('CREATE INDEX IF NOT EXISTS patrimonial_assets_category_idx ON patrimonial_assets(category);');
  await client.execute('CREATE INDEX IF NOT EXISTS patrimonial_assets_valuation_date_idx ON patrimonial_assets(valuation_date);');
  await client.execute('CREATE INDEX IF NOT EXISTS patrimonial_liabilities_category_idx ON patrimonial_liabilities(category);');
  await client.execute('CREATE INDEX IF NOT EXISTS patrimonial_liabilities_due_date_idx ON patrimonial_liabilities(due_date);');
  await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS patrimonial_snapshots_month_unique ON patrimonial_snapshots(month);');
  await client.execute('CREATE INDEX IF NOT EXISTS patrimonial_snapshots_month_idx ON patrimonial_snapshots(month);');
  await client.execute('CREATE INDEX IF NOT EXISTS recurring_flows_type_idx ON recurring_flows(type);');
  await client.execute('CREATE INDEX IF NOT EXISTS recurring_flows_active_idx ON recurring_flows(is_active);');
  await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS planning_alerts_fingerprint_unique ON planning_alerts(fingerprint);');
  await client.execute('CREATE INDEX IF NOT EXISTS planning_alerts_period_idx ON planning_alerts(period);');

  // 5. Seed default categories if none exist
  const existingCategories = await client.execute('SELECT COUNT(*) as count FROM categories');
  const count = Number(existingCategories.rows[0]?.count || 0);

  if (count === 0) {
    const defaultCategories = [
      { id: 'cat-salario', name: 'Salário & Renda', group: 'INCOME', color: '#10b981', icon: 'Coins', budgetLimit: 0 },
      { id: 'cat-rendimentos', name: 'Rendimentos/Dividendos', group: 'INCOME', color: '#34d399', icon: 'TrendingUp', budgetLimit: 0 },
      { id: 'cat-moradia', name: 'Moradia (Aluguel/Condomínio)', group: 'FIXED', color: '#6366f1', icon: 'Home', budgetLimit: 2800 },
      { id: 'cat-supermercado', name: 'Supermercado & Essenciais', group: 'FIXED', color: '#3b82f6', icon: 'ShoppingBag', budgetLimit: 1500 },
      { id: 'cat-contas', name: 'Contas & Serviços (Luz/Internet)', group: 'FIXED', color: '#0ea5e9', icon: 'Zap', budgetLimit: 450 },
      { id: 'cat-saude', name: 'Saúde & Farmácia', group: 'FIXED', color: '#ec4899', icon: 'HeartPulse', budgetLimit: 500 },
      { id: 'cat-restaurantes', name: 'Restaurantes & Delivery', group: 'VARIABLE', color: '#f59e0b', icon: 'Utensils', budgetLimit: 800 },
      { id: 'cat-transporte', name: 'Transporte (Uber/Combustível)', group: 'VARIABLE', color: '#eab308', icon: 'Car', budgetLimit: 600 },
      { id: 'cat-lazer', name: 'Lazer, Viagens & Hobbies', group: 'VARIABLE', color: '#8b5cf6', icon: 'Compass', budgetLimit: 700 },
      { id: 'cat-assinaturas', name: 'Assinaturas & Softwares', group: 'VARIABLE', color: '#a855f7', icon: 'Tv', budgetLimit: 250 },
      { id: 'cat-investimentos', name: 'Aportes & Investimentos', group: 'INVESTMENT', color: '#059669', icon: 'PiggyBank', budgetLimit: 3000 },
      { id: 'cat-outros', name: 'Outros / Diversos', group: 'VARIABLE', color: '#94a3b8', icon: 'MoreHorizontal', budgetLimit: 400 },
    ];

    for (const c of defaultCategories) {
      await client.execute({
        sql: 'INSERT INTO categories (id, name, "group", color, icon, budget_limit) VALUES (?, ?, ?, ?, ?, ?)',
        args: [c.id, c.name, c.group, c.color, c.icon, c.budgetLimit],
      });
    }
  }

  initialized = true;
}
