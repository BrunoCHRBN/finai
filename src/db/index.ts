import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';
import path from 'path';

// Use local SQLite file by default, or Turso / Cloud URL if DATABASE_URL is set
const dbUrl = process.env.DATABASE_URL || `file:${path.join(process.cwd(), 'finai.db')}`;
const dbAuthToken = process.env.DATABASE_AUTH_TOKEN;

const client = createClient({
  url: dbUrl,
  authToken: dbAuthToken,
});

export const db = drizzle(client, { schema });

// Auto-initialize tables and default categories/seed data if needed
let initialized = false;

export async function ensureDbInitialized() {
  if (initialized) return;

  // Create tables if they do not exist
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
      account_id TEXT NOT NULL,
      category_id TEXT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SETTLED',
      pluggy_transaction_id TEXT,
      is_ignored INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL,
      category_id TEXT NOT NULL,
      planned_amount REAL NOT NULL DEFAULT 0
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL NOT NULL DEFAULT 0,
      deadline TEXT,
      category TEXT NOT NULL DEFAULT 'EMERGENCY',
      color TEXT DEFAULT '#10b981'
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

  // Seed default categories if none exist
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

    // Seed default starter accounts
    await client.execute({
      sql: `INSERT INTO accounts (id, name, type, balance, currency_code, institution_name, color, updated_at) 
            VALUES ('acc-nubank', 'Nubank Conta Principal', 'CHECKING', 4850.20, 'BRL', 'Nubank', '#820ad1', datetime('now')),
                   ('acc-itau', 'Itaú Personalité', 'CHECKING', 12340.50, 'BRL', 'Itaú', '#ec7000', datetime('now')),
                   ('acc-xp', 'XP Investimentos', 'INVESTMENT', 45000.00, 'BRL', 'XP', '#1e293b', datetime('now')),
                   ('acc-nubank-card', 'Cartão Nubank Ultravioleta', 'CREDIT_CARD', -2850.40, 'BRL', 'Nubank', '#820ad1', datetime('now'))`,
      args: [],
    });

    // Seed realistic current month transactions (2026-10)
    const seedTransactions = [
      { id: 'tx-1', accountId: 'acc-itau', categoryId: 'cat-salario', description: 'TED Recebida - Salário Mensal', amount: 14500.00, date: '2026-10-05', type: 'CREDIT' },
      { id: 'tx-2', accountId: 'acc-itau', categoryId: 'cat-moradia', description: 'PIX Aluguel + Condomínio', amount: -2850.00, date: '2026-10-06', type: 'DEBIT' },
      { id: 'tx-3', accountId: 'acc-nubank', categoryId: 'cat-supermercado', description: 'Pão de Açúcar Morumbi', amount: -642.30, date: '2026-10-07', type: 'DEBIT' },
      { id: 'tx-4', accountId: 'acc-nubank-card', categoryId: 'cat-restaurantes', description: 'iFood Brasil Delivery', amount: -89.90, date: '2026-10-08', type: 'DEBIT' },
      { id: 'tx-5', accountId: 'acc-nubank-card', categoryId: 'cat-restaurantes', description: 'Outback Steakhouse', amount: -245.00, date: '2026-10-10', type: 'DEBIT' },
      { id: 'tx-6', accountId: 'acc-nubank-card', categoryId: 'cat-transporte', description: 'Uber Rides *BR', amount: -38.50, date: '2026-10-11', type: 'DEBIT' },
      { id: 'tx-7', accountId: 'acc-nubank', categoryId: 'cat-contas', description: 'Enel Energia Elétrica', amount: -210.40, date: '2026-10-12', type: 'DEBIT' },
      { id: 'tx-8', accountId: 'acc-nubank', categoryId: 'cat-contas', description: 'Vivo Fibra Internet 600M', amount: -149.90, date: '2026-10-12', type: 'DEBIT' },
      { id: 'tx-9', accountId: 'acc-nubank-card', categoryId: 'cat-assinaturas', description: 'Netflix / Spotify / Claude', amount: -165.00, date: '2026-10-13', type: 'DEBIT' },
      { id: 'tx-10', accountId: 'acc-itau', categoryId: 'cat-investimentos', description: 'Aplicação Tesouro Selic 2029', amount: -3500.00, date: '2026-10-14', type: 'DEBIT' },
      { id: 'tx-11', accountId: 'acc-nubank-card', categoryId: 'cat-restaurantes', description: 'iFood Brasil Delivery', amount: -112.40, date: '2026-10-14', type: 'DEBIT' },
      { id: 'tx-12', accountId: 'acc-nubank', categoryId: 'cat-supermercado', description: 'Carrefour Express', amount: -178.60, date: '2026-10-15', type: 'DEBIT' },
    ];

    for (const t of seedTransactions) {
      await client.execute({
        sql: `INSERT INTO transactions (id, account_id, category_id, description, amount, date, type, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'SETTLED', datetime('now'))`,
        args: [t.id, t.accountId, t.categoryId, t.description, t.amount, t.date, t.type],
      });
    }

    // Seed starter goals
    await client.execute({
      sql: `INSERT INTO goals (id, title, target_amount, current_amount, deadline, category, color)
            VALUES ('goal-reserva', 'Reserva de Emergência (6 Meses)', 45000.00, 31200.00, '2026-12-31', 'EMERGENCY', '#10b981'),
                   ('goal-invest', 'Meta Aporte Anual Ações/FIIs', 50000.00, 38500.00, '2026-12-31', 'INVESTMENT', '#3b82f6'),
                   ('goal-viagem', 'Férias Japão 2027', 25000.00, 9500.00, '2027-05-01', 'MILESTONE', '#a855f7')`,
      args: [],
    });
  }

  initialized = true;
}
