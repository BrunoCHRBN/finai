import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // CHECKING, CREDIT_CARD, SAVINGS, INVESTMENT
  balance: real('balance').notNull().default(0),
  currencyCode: text('currency_code').notNull().default('BRL'),
  pluggyItemId: text('pluggy_item_id'),
  pluggyAccountId: text('pluggy_account_id'),
  institutionName: text('institution_name'),
  color: text('color').default('#3b82f6'),
  updatedAt: text('updated_at').notNull(),
});

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  group: text('group').notNull(), // FIXED (Necessidades), VARIABLE (Estilo de vida/Lazer), INVESTMENT (Aportes/Metas), INCOME (Renda)
  color: text('color').notNull().default('#64748b'),
  icon: text('icon').notNull().default('Tag'),
  budgetLimit: real('budget_limit').notNull().default(0),
});

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id),
  categoryId: text('category_id').references(() => categories.id),
  description: text('description').notNull(),
  amount: real('amount').notNull(), // Negative for expense, positive for income
  date: text('date').notNull(), // YYYY-MM-DD
  type: text('type').notNull(), // DEBIT, CREDIT
  status: text('status').notNull().default('SETTLED'), // SETTLED, PENDING
  pluggyTransactionId: text('pluggy_transaction_id'),
  isIgnored: integer('is_ignored').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const budgets = sqliteTable('budgets', {
  id: text('id').primaryKey(),
  month: text('month').notNull(), // YYYY-MM
  categoryId: text('category_id').notNull().references(() => categories.id),
  plannedAmount: real('planned_amount').notNull().default(0),
});

export const goals = sqliteTable('goals', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  targetAmount: real('target_amount').notNull(),
  currentAmount: real('current_amount').notNull().default(0),
  deadline: text('deadline'),
  category: text('category').notNull().default('EMERGENCY'), // EMERGENCY, INVESTMENT, MILESTONE
  color: text('color').default('#10b981'),
});

export const aiDiagnostics = sqliteTable('ai_diagnostics', {
  id: text('id').primaryKey(),
  month: text('month').notNull(), // YYYY-MM
  maturityLevel: integer('maturity_level').notNull().default(1),
  summary: text('summary').notNull(),
  syntheticSnapshot: text('synthetic_snapshot').notNull(), // JSON
  actionableSteps: text('actionable_steps').notNull(), // JSON array
  savingsRate: real('savings_rate').notNull().default(0),
  burnRate: real('burn_rate').notNull().default(0),
  runwayMonths: real('runway_months').notNull().default(0),
  tokenCount: integer('token_count').notNull().default(0),
  createdAt: text('created_at').notNull(),
});
