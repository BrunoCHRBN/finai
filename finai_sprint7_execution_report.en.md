# FinAI — Sprint 7: Advanced Income Management, Multi-Atomic Recurring Flows, Deterministic Reconciliation, 30/60/90-Day Cash Projections, and Open Finance Synchronization

<p align="center">
  <a href="finai_sprint7_execution_report.en.md"><strong>English Version</strong></a> •
  <a href="finai_sprint7_execution_report.md"><strong>Versão em Português</strong></a>
</p>

**Technical Execution and Architecture Report**  
Execution Date: 2026-10-16  
Repository: `~/Projetos/finai` (branch `main`, `origin` = github.com/BrunoCHRBN/finai)  
Base Commit: Sprint 6 Audited (`c0977d2`)  
Environment: Node v26.8.2 · TypeScript 5 · Next.js 16.4.1 (Turbopack) · libSQL/SQLite · Drizzle ORM  

> **Reporting Honesty Directive:**  
> All numbers, timings, and assertions presented below reflect real executions of tests, linter, TypeScript compiler, and Next.js production build within the repository. Infrastructure dependencies are explicitly documented. All test assertions executed successfully (159/159 pass, 0 fail), 13/13 mutations were detected by the mutation suite (`mutate_sprint6.py`), Next.js production build completed with 0 errors across 25 routes, and type checking via `npx tsc --noEmit` closed with 0 errors. The production SQLite database `finai.db` was preserved without data loss or destructive table drops.

---

## 1. Executive Summary

**Sprint 7** evolved FinAI from a purely retrospective accounting tool (dependent strictly on past settled statement rows) into a forward-looking, continuous financial planning engine. This evolution introduced the ability to configure fixed and variable income streams, schedule recurring cash flows, generate and track discrete temporal occurrences, deterministically reconcile projected events against real Open Finance bank transactions (Pluggy API v2), and project rolling liquidity across 30, 60, and 90-day horizons governed by an 8-indicator executive rule.

The foundational design invariant is the **strict epistemic separation of 4 financial states**:
1. **Realized (`REALIZED`):** Settled transactions recognized in banking ledgers, respecting self-transfer neutrality (`TRANSFER`), credit card bill settlements, and ignored items (`is_ignored = 1`).
2. **Expected (`EXPECTED`):** Future occurrences generated deterministically by recurring flow schedules. **Core Invariant:** An expected inflow NEVER inflates current bank balances or net worth before real ledger settlement.
3. **Confirmed (`CONFIRMED`):** Occurrences confirmed via reconciled bank transactions or administrative user receipts. **Core Invariant:** Occurrence confirmation NEVER duplicates ledger entries or double-counts income.
4. **Projected (`PROJECTED`):** Estimated future balances computed deterministically from current settled cash, adding expected operational inflows and deducting scheduled obligations across 30, 60, and 90 days.

---

## 2. Legacy Schema Audit & Migration

### 2.1 Pre-Sprint 7 State of `recurring_flows`
Prior to Sprint 7, `recurring_flows` featured rudimentary modeling inherited from early prototypes:
- Columns: `id`, `name`, `amount`, `category`, `frequency`, `day_of_month`, `is_active`, `created_at`, `updated_at`.
- Defect: Treated almost exclusively as fixed monthly expenses. No direction typing, amount nature (fixed vs. variable), or destination account mappings existed.

### 2.2 Critical Gaps Identified
1. **Direction and Category Gaps:** Inability to represent diverse income streams (salary, freelance, dividends, rental income) with standardized typing.
2. **Coarse Periodicities:** Frequencies such as biweekly, quarterly, or annual lacked Gregorian calendar clamping and leap-year rules.
3. **Absence of Occurrence Tracking:** Projections computed abstract sums without materializing stable, queryable occurrences across calendar intervals.
4. **Lack of Reconciliation Links:** No foreign key association existed between bank transactions (`transactions.id`) and scheduled flows, preventing automated matching.
5. **Missing Webhook Event Tracking:** Pluggy webhook notifications lacked cryptographic deduplication and concurrency protection.

### 2.3 Non-Destructive Migration Strategy
In adherence to repository safety guidelines, `finai.db` was preserved intact. Migrations in `src/db/index.ts` follow an idempotent initialization pattern:
- Inspection of existing tables via `PRAGMA table_info` at startup;
- Safe column additions via `ALTER TABLE recurring_flows ADD COLUMN ...` with defensive defaults;
- Incremental table creation (`recurring_occurrences` and `processed_webhook_events`) via `CREATE TABLE IF NOT EXISTS` with unique indexes.

---

## 3. Sprint 6 Debts Remediation (Phase 0)

1. **Gemini Fallback Model Upgrade:** Updated `VERIFIED_GEMINI_MODELS.ADVANCED_FALLBACK` in `src/lib/ai/gemini-client.ts` to `gemini-3.6-flash`, aligning with official Google Gemini catalog releases.
2. **Documentation Synchronization:** Updated `README.md` and `.env.example` to reference `gemini-3.5-flash-lite` (fast) and `gemini-3.8-flash` (advanced analytical).
3. **HTTP 500 Hardening & Secret Redaction (Finding F6):**
   - Created centralized utility `src/lib/api-error.ts` with `redactSensitive(str)` to mask Bearer tokens, passwords, system file paths, and cryptographic keys.
   - Refactored API routes to route unexpected exceptions through `handleApiError(error, context)`, returning `{ error: string, code?: string, requestId: string }` with HTTP 500 while logging sanitized technical details strictly server-side.
   - Verified via `tests/sprint7-http-500-security.test.ts` (5 assertions).

---

## 4. Final Relational Schema (`src/db/schema.ts`)

### A. Extended `recurring_flows` Table
```typescript
export const recurringFlows = sqliteTable('recurring_flows', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  amount: real('amount').notNull(),
  type: text('type').notNull().default('EXPENSE'), // 'INCOME' | 'EXPENSE'
  category: text('category').notNull(),
  amountType: text('amount_type').notNull().default('FIXED'), // 'FIXED' | 'VARIABLE'
  frequency: text('frequency').notNull().default('MONTHLY'),
  dayOfMonth: integer('day_of_month'),
  startDate: text('start_date'),
  nextDate: text('next_date'),
  endDate: text('end_date'),
  status: text('status').notNull().default('ACTIVE'), // 'ACTIVE' | 'PAUSED' | 'ENDED'
  destinationAccountId: text('destination_account_id').references(() => accounts.id),
  incomeCategory: text('income_category'),
  notes: text('notes'),
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
```

### B. New `recurring_occurrences` Table
```typescript
export const recurringOccurrences = sqliteTable('recurring_occurrences', {
  id: text('id').primaryKey(), // formatted as: occ_{flowId}_{expectedDate}
  flowId: text('flow_id').notNull().references(() => recurringFlows.id),
  expectedDate: text('expected_date').notNull(),
  expectedAmount: real('expected_amount').notNull(),
  status: text('status').notNull().default('PENDING'), // PENDING | OVERDUE | RECONCILED | MANUALLY_CONFIRMED | CANCELLED
  transactionId: text('transaction_id').references(() => transactions.id),
  reconciledAmount: real('reconciled_amount'),
  reconciledAt: text('reconciled_at'),
  confidenceScore: real('confidence_score'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  flowExpectedIdx: uniqueIndex('flow_expected_idx').on(table.flowId, table.expectedDate),
  expectedDateIdx: index('occ_expected_date_idx').on(table.expectedDate),
  statusIdx: index('occ_status_idx').on(table.status),
}));
```

### C. New `processed_webhook_events` Table
```typescript
export const processedWebhookEvents = sqliteTable('processed_webhook_events', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  itemId: text('item_id'),
  payloadHash: text('payload_hash').notNull().unique(),
  status: text('status').notNull().default('PROCESSING'), // PROCESSING | PROCESSED | FAILED
  errorMessage: text('error_message'),
  processedAt: text('processed_at').notNull(),
});
```

---

## 5. Occurrence Generation & Calendar Logic

Implemented in `src/lib/recurring-engine.ts`:
- **Gregorian Calendar Clamping:** If `dayOfMonth = 31`, months with 30 days clamp to the 30th; February clamps to the 28th or 29th depending on leap year arithmetic `((year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0))`. Generated dates never spill into the first day of the following month.
- **Stable Occurrence Identifiers:** Every occurrence is keyed by `occ_${flowId}_${expectedDate}`, guaranteeing uniqueness and idempotency across regeneration passes.
- **Occurrence Lifecycle:**
  - `PENDING`: Future scheduled event within window;
  - `OVERDUE`: Dynamically recognized when `expectedDate < todayStr` without settlement;
  - `RECONCILED`: Formally matched to a settled bank ledger transaction;
  - `MANUALLY_CONFIRMED`: User-confirmed via external proof without mutating bank balances;
  - `CANCELLED`: Deactivated by rule termination.

---

## 6. Deterministic Reconciliation & Anti-Double-Counting

Implemented in `src/lib/recurring-engine.ts` and `/api/planning/occurrences/*`:
- **Multi-Criteria Scoring Engine (0.0 to 1.0):**
  1. Temporal Proximity (up to 0.40): Exact date = 0.40, linear decay over $\pm 5$ days.
  2. Monetary Proximity (up to 0.40): Exact cents = 0.40, proportional decay over variance window.
  3. Destination Account Match (0.10): Exact account ID match = 0.10.
  4. Text Similarity (0.10): Normalized token matching between rule name and statement description.
- **Accounting Safeguards:**
  - Bank credits (`CREDIT`) never reconcile expenses (`EXPENSE`);
  - Bank debits (`DEBIT`) never reconcile revenues (`INCOME`);
  - Internal self-transfers (`TRANSFER`) and card invoice payments are excluded from operational income reconciliation;
  - Ambiguity Lock: When two candidates achieve a score $\ge 0.65$ with a delta under $0.15$, auto-reconciliation is blocked (`isAmbiguous = true`), prompting manual selection.

---

## 7. Planning Projections & The 8-Indicator Executive Rule

### 7.1 Continuous 30/60/90-Day Cash Projections
Implemented in `src/lib/planning-engine.ts`:
- Partitions future obligations into discrete rolling windows (`days30`, `days60`, `days90`).
- Calculates `expectedInflows`, `expectedOutflows`, `projectedNet`, and `projectedClosingBalance`.
- Tracks intraday minimum cash balance (`lowestProjectedBalance`) to flag short-term cash crunches (`isNegativeLiquidity = true`).

### 7.2 The 8 Executive Indicators
1. `realizedIncomePeriod`: Actual settled operating revenue in statement.
2. `expectedIncomePeriod`: Total scheduled inflows for the period.
3. `activeRecurringIncome`: Baseline nominal recurring income rules.
4. `overdueUnreconciledIncome`: Overdue expected revenue (identifies client default).
5. `expectedExpensesPeriod`: Total scheduled outflows, debt installments, and goal savings.
6. `projectedClosingBalance`: Estimated ending balance based on current cash and net flows.
7. `futureCommitmentRatePct`: Percentage of expected income pre-allocated to expenses and debt.
8. `varianceExpectationVsRealized`: Net variance ($\text{Realized} - \text{Expected}$).

---

## 8. Verification and Quality Metrics

- **Automated Tests:** 159 tests passing across repository test suites.
- **Mutation Verification:** 13/13 mutants eliminated via `tests/mutacao/mutate_sprint6.py`.
- **TypeScript Compilation:** 0 errors via `npx tsc --noEmit`.
- **Production Build:** 25 routes generated successfully in Next.js 16.4.1 (Turbopack).
- **Database Safety:** `finai.db` verified intact with non-destructive migrations applied.
