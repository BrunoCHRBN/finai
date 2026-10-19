import { sqliteTable, text, real, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
}, (table) => [
  uniqueIndex('accounts_pluggy_acc_id_unique').on(table.pluggyAccountId),
  index('accounts_pluggy_item_id_idx').on(table.pluggyItemId),
]);

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
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'restrict' }),
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
  description: text('description').notNull(),
  amount: real('amount').notNull(), // Negative for expense/outflow, positive for income/inflow
  date: text('date').notNull(), // YYYY-MM-DD
  type: text('type').notNull(), // DEBIT, CREDIT, TRANSFER
  status: text('status').notNull().default('SETTLED'), // SETTLED, PENDING
  pluggyTransactionId: text('pluggy_transaction_id'),
  transferId: text('transfer_id'), // Paired transfer identifier for self-transfers / invoice payments
  isIgnored: integer('is_ignored').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('transactions_pluggy_tx_id_unique').on(table.pluggyTransactionId),
  index('transactions_account_id_idx').on(table.accountId),
  index('transactions_category_id_idx').on(table.categoryId),
  index('transactions_date_idx').on(table.date),
  index('transactions_type_idx').on(table.type),
  index('transactions_is_ignored_idx').on(table.isIgnored),
]);

export const budgets = sqliteTable('budgets', {
  id: text('id').primaryKey(),
  month: text('month').notNull(), // YYYY-MM
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  name: text('name'),
  plannedAmount: real('planned_amount').notNull().default(0),
  status: text('status').notNull().default('ACTIVE'), // ACTIVE, CLOSED
  historyJson: text('history_json').notNull().default('[]'),
  updatedAt: text('updated_at'),
}, (table) => [
  index('budgets_month_category_idx').on(table.month, table.categoryId),
]);

export const goals = sqliteTable('goals', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  purpose: text('purpose'),
  targetAmount: real('target_amount').notNull(),
  currentAmount: real('current_amount').notNull().default(0),
  plannedMonthlyContribution: real('planned_monthly_contribution').notNull().default(0),
  deadline: text('deadline'), // YYYY-MM-DD or YYYY-MM
  category: text('category').notNull().default('EMERGENCY'), // EMERGENCY, INVESTMENT, MILESTONE, RETIREMENT, EDUCATION
  status: text('status').notNull().default('ACTIVE'), // ACTIVE, PAUSED, COMPLETED, CANCELLED
  priority: integer('priority').notNull().default(1),
  linkedAccountId: text('linked_account_id'),
  color: text('color').default('#10b981'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
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

export const syncLocks = sqliteTable('sync_locks', {
  key: text('key').primaryKey(),
  acquiredAt: text('acquired_at').notNull(),
  status: text('status').notNull(), // SYNCING
});

export const syncLogs = sqliteTable('sync_logs', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull(),
  status: text('status').notNull(), // SUCCESS, PARTIAL, FAILED
  accountsSynced: integer('accounts_synced').notNull().default(0),
  transactionsNew: integer('transactions_new').notNull().default(0),
  transactionsUpdated: integer('transactions_updated').notNull().default(0),
  transactionsIgnored: integer('transactions_ignored').notNull().default(0),
  errorMessage: text('error_message'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at').notNull(),
  durationMs: integer('duration_ms').notNull().default(0),
}, (table) => [
  index('sync_logs_item_id_idx').on(table.itemId, table.startedAt),
]);

export const patrimonialAssets = sqliteTable('patrimonial_assets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(), // REAL_ESTATE, VEHICLE, INVESTMENT, EQUITY, VALUABLE, CASH, OTHER
  currentValue: real('current_value').notNull().default(0),
  acquisitionValue: real('acquisition_value'),
  acquisitionDate: text('acquisition_date'), // YYYY-MM-DD
  valuationDate: text('valuation_date').notNull(), // YYYY-MM-DD
  liquidity: text('liquidity').notNull().default('MEDIUM'), // IMMEDIATE, SHORT_TERM, MEDIUM, ILLIQUID
  notes: text('notes'),
  dataSource: text('data_source').notNull().default('MANUAL'), // MANUAL, ESTIMATED
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('patrimonial_assets_category_idx').on(table.category),
  index('patrimonial_assets_valuation_date_idx').on(table.valuationDate),
]);

export const patrimonialLiabilities = sqliteTable('patrimonial_liabilities', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(), // REAL_ESTATE_MORTGAGE, VEHICLE_FINANCING, PERSONAL_LOAN, PAYROLL_LOAN, TAX_DEBT, OTHER
  currentBalance: real('current_balance').notNull().default(0),
  originalAmount: real('original_amount'),
  interestRate: real('interest_rate'),
  startDate: text('start_date'),
  dueDate: text('due_date'),
  installmentsTotal: integer('installments_total'),
  installmentsRemaining: integer('installments_remaining'),
  monthlyPayment: real('monthly_payment'),
  creditor: text('creditor'),
  notes: text('notes'),
  dataSource: text('data_source').notNull().default('MANUAL'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('patrimonial_liabilities_category_idx').on(table.category),
  index('patrimonial_liabilities_due_date_idx').on(table.dueDate),
]);

export const patrimonialSnapshots = sqliteTable('patrimonial_snapshots', {
  id: text('id').primaryKey(),
  month: text('month').notNull(), // YYYY-MM
  totalAssets: real('total_assets').notNull().default(0),
  totalLiabilities: real('total_liabilities').notNull().default(0),
  netWorth: real('net_worth').notNull().default(0),
  liquidAssets: real('liquid_assets').notNull().default(0),
  investedAssets: real('invested_assets').notNull().default(0),
  fixedAssets: real('fixed_assets').notNull().default(0),
  shortTermLiabilities: real('short_term_liabilities').notNull().default(0),
  longTermLiabilities: real('long_term_liabilities').notNull().default(0),
  detailsJson: text('details_json'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('patrimonial_snapshots_month_unique').on(table.month),
  index('patrimonial_snapshots_month_idx').on(table.month),
]);

export const recurringFlows = sqliteTable('recurring_flows', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  type: text('type').notNull(), // INCOME, EXPENSE
  nature: text('nature').notNull().default('CONFIRMED'), // CONFIRMED, ESTIMATED
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
  amount: real('amount').notNull(), // Positive magnitude
  amountType: text('amount_type').notNull().default('FIXED'), // FIXED, VARIABLE
  frequency: text('frequency').notNull().default('MONTHLY'), // WEEKLY, BIWEEKLY, SEMIMONTHLY, MONTHLY, QUARTERLY, ANNUAL, ONCE
  dayOfMonth: integer('day_of_month').default(5),
  secondDayOfMonth: integer('second_day_of_month'),
  startDate: text('start_date'), // YYYY-MM-DD
  nextDate: text('next_date'), // YYYY-MM-DD
  endDate: text('end_date'), // YYYY-MM-DD
  startMonth: text('start_month').notNull(), // YYYY-MM
  endMonth: text('end_month'), // YYYY-MM
  totalInstallments: integer('total_installments'),
  remainingInstallments: integer('remaining_installments'),
  isActive: integer('is_active').notNull().default(1),
  status: text('status').notNull().default('ACTIVE'), // ACTIVE, PAUSED, ENDED
  destinationAccountId: text('destination_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  incomeCategory: text('income_category'), // SALARY, FREELANCE, COMMISSION, RENTAL, BENEFIT, OTHER
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('recurring_flows_type_idx').on(table.type),
  index('recurring_flows_active_idx').on(table.isActive),
  index('recurring_flows_status_idx').on(table.status),
]);

export const recurringOccurrences = sqliteTable('recurring_occurrences', {
  id: text('id').primaryKey(),
  flowId: text('flow_id').notNull().references(() => recurringFlows.id, { onDelete: 'cascade' }),
  expectedDate: text('expected_date').notNull(), // YYYY-MM-DD
  expectedAmount: real('expected_amount').notNull(),
  status: text('status').notNull().default('PENDING'), // PENDING, OVERDUE, RECONCILED, MANUALLY_CONFIRMED, CANCELLED
  transactionId: text('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
  reconciledAmount: real('reconciled_amount'),
  reconciledAt: text('reconciled_at'),
  confidenceScore: real('confidence_score'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('recurring_occurrences_flow_date_unique').on(table.flowId, table.expectedDate),
  index('recurring_occurrences_flow_id_idx').on(table.flowId),
  index('recurring_occurrences_expected_date_idx').on(table.expectedDate),
  index('recurring_occurrences_status_idx').on(table.status),
  index('recurring_occurrences_transaction_id_idx').on(table.transactionId),
]);

export const planningAlerts = sqliteTable('planning_alerts', {
  id: text('id').primaryKey(),
  fingerprint: text('fingerprint').notNull(),
  type: text('type').notNull(),
  severity: text('severity').notNull(), // INFO, WARNING, CRITICAL
  title: text('title').notNull(),
  reason: text('reason').notNull(),
  period: text('period').notNull(),
  foundationJson: text('foundation_json').notNull(),
  status: text('status').notNull().default('ACTIVE'), // ACTIVE, DISMISSED, RESOLVED
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('planning_alerts_fingerprint_unique').on(table.fingerprint),
  index('planning_alerts_period_idx').on(table.period),
]);

export const planningPreferences = sqliteTable('planning_preferences', {
  id: text('id').primaryKey(),
  minLiquidityThreshold: real('min_liquidity_threshold').notNull().default(1000),
  budgetWarningPct: real('budget_warning_pct').notNull().default(80),
  budgetCriticalPct: real('budget_critical_pct').notNull().default(100),
  maxDataStalenessDays: integer('max_data_staleness_days').notNull().default(7),
  liabilityDueSoonDays: integer('liability_due_soon_days').notNull().default(7),
  syncIntervalMinutes: integer('sync_interval_minutes').notNull().default(0), // 0=Manual, 30, 60, 180, 360, 720, 1440
  lastSyncAt: text('last_sync_at'),
  nextScheduledSyncAt: text('next_scheduled_sync_at'),
  updatedAt: text('updated_at').notNull(),
});

export const processedWebhookEvents = sqliteTable('processed_webhook_events', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  itemId: text('item_id'),
  payloadHash: text('payload_hash').notNull(),
  status: text('status').notNull().default('PROCESSING'), // 'PROCESSING' | 'PROCESSED' | 'FAILED'
  errorMessage: text('error_message'),
  processedAt: text('processed_at').notNull(),
}, (table) => [
  index('processed_webhook_events_item_id_idx').on(table.itemId),
  index('processed_webhook_events_status_idx').on(table.status),
]);

export const marketAssets = sqliteTable('market_assets', {
  id: text('id').primaryKey(), // "B3:PETR4" or "CRYPTO:BTCUSDT"
  symbol: text('symbol').notNull(),
  name: text('name').notNull(),
  assetType: text('asset_type').notNull(), // 'STOCK', 'FII', 'BDR', 'ETF', 'INDEX', 'CRYPTO'
  market: text('market').notNull(), // 'B3', 'CRYPTO'
  currency: text('currency').notNull().default('BRL'),
  logoUrl: text('logo_url'),
  sector: text('sector'),
  subType: text('sub_type'),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('market_assets_symbol_market_unique').on(table.symbol, table.market),
  index('market_assets_type_idx').on(table.assetType),
  index('market_assets_market_idx').on(table.market),
]);

export const marketQuotesCache = sqliteTable('market_quotes_cache', {
  id: text('id').primaryKey(), // matches assetId
  assetId: text('asset_id').notNull().references(() => marketAssets.id, { onDelete: 'cascade' }),
  price: real('price').notNull(),
  change24hPct: real('change_24h_pct').notNull().default(0),
  change24hAmount: real('change_24h_amount').notNull().default(0),
  dayHigh: real('day_high'),
  dayLow: real('day_low'),
  volume24h: real('volume_24h'),
  marketCap: real('market_cap'),
  quoteTimestamp: text('quote_timestamp').notNull(),
  fetchedAt: text('fetched_at').notNull(),
  rawPayloadJson: text('raw_payload_json'),
}, (table) => [
  index('market_quotes_cache_asset_id_idx').on(table.assetId),
  index('market_quotes_cache_fetched_at_idx').on(table.fetchedAt),
]);

export const marketWatchlist = sqliteTable('market_watchlist', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull().references(() => marketAssets.id, { onDelete: 'cascade' }),
  targetPriceAlertHigh: real('target_price_alert_high'),
  targetPriceAlertLow: real('target_price_alert_low'),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('market_watchlist_asset_id_unique').on(table.assetId),
  index('market_watchlist_sort_order_idx').on(table.sortOrder),
]);




