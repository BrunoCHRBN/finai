# Sprint 7.1 Execution Report — Temporal Precision Correction, Webhook Security, and Projection Integrity

<p align="center">
  <a href="finai_sprint7_1_execution_report.en.md"><strong>English Version</strong></a> •
  <a href="finai_sprint7_1_execution_report.md"><strong>Versão em Português</strong></a>
</p>

**Project:** FinAI — Intelligent Personal Financial Planning  
**Sprint:** 7.1 (Corrective Review and Hardening of Sprint 7)  
**Date:** October 16, 2026  
**Environment:** Linux (x86_64), Node.js v20+, Next.js 16.4.1 (Turbopack), TypeScript 5.x, SQLite (libSQL), Drizzle ORM  

---

## 1. Executive Summary

Sprint 7.1 conducted an audit, mathematical correction, and security hardening of the planning and Open Finance infrastructure implemented in Sprint 7.

The initial Sprint 7 implementation utilized fractional multipliers for 30, 60, and 90-day projections (such as 4.33x for weekly flows and 2.16x for biweekly flows, mapped into calendar months rather than rolling temporal windows starting from today), while conflating biweekly frequencies (14-day steps vs. two fixed monthly dates). In the Open Finance module, the Pluggy webhook endpoint lacked shared-secret authentication and relied on payload hashes in a manner that dropped distinct events carrying identical bodies, operating without durable state transitions.

Sprint 7.1 eliminated these defects:
1. **Discrete Occurrence Projection Engine:** Rolling projections (30, 60, and 90 days) were rewritten to evaluate concrete, dated occurrences (`generateOccurrencesForFlow` or persisted rows in `recurringOccurrences`), eliminating fractional multipliers and boundary distortions.
2. **Explicit Periodicities:** Formally separated 14-day intervals (`BIWEEKLY`, 26 occurrences/year) from twice-monthly schedules on two fixed calendar dates (`SEMIMONTHLY`, 24 occurrences/year) with `secondDayOfMonth` support across database schema and user interface.
3. **Hardened Webhook Authentication & Idempotency:** Implemented constant-time shared-secret validation (`crypto.timingSafeEqual`) against `PLUGGY_WEBHOOK_SECRET`, primary deduplication anchored on official Pluggy `eventId`, and durable lifecycle transitions (`PROCESSING` -> `PROCESSED` / `FAILED` with persisted `errorMessage`).
4. **Operational Transparency:** Open Finance UI explicitly clarifies that on-demand sync triggers on navigation or via external OS cron/CLI scripts, removing the misconception of an internal background daemon inside the Next.js serverless runtime.
5. **Edge-Case Arithmetic Hardening:** Future commitment rate (`futureCommitmentRatePct`) was safeguarded against zero-division and zero-income states, returning safe 0% instead of `NaN` or false 100%.
6. **Gemini Model Deprecation Roadmap:** Audited Google AI lifecycle schedules, mapping the migration path from `gemini-3.1-flash-lite` to `gemini-3.5-flash-lite`.
7. **Comprehensive Verification:** Repository test suite expanded to **178 tests passing across 34 suites (0 failures)**, 100% mutation detection (13/13 mutants eliminated), and clean Next.js production build.

---

## 2. Inventory of Modified Files

| File | Change Nature | Summary |
| :--- | :--- | :--- |
| `src/lib/planning-engine.ts` | Algorithmic Fix | Removed fractional multipliers (4.33x, 2.16x); discrete occurrence evaluation for 30/60/90-day windows; intraday `lowestProjectedBalance` and `isNegativeLiquidity` tracking; zero-division protection on `futureCommitmentRatePct`. |
| `src/lib/recurring-engine.ts` | Algorithmic Fix | Bidirectional support for `ANNUAL` and `YEARLY`; occurrence generation for `BIWEEKLY` (14-day step) and `SEMIMONTHLY` (two fixed calendar dates with short-month clamping). |
| `src/db/schema.ts` | Drizzle Schema | Added `errorMessage` column and search index on `status` in `processedWebhookEvents`. |
| `src/db/index.ts` | Incremental Migration | Non-destructive startup migration via `PRAGMA table_info` adding `error_message` without altering existing rows. |
| `src/app/api/pluggy/webhook/route.ts` | Security & Concurrency | Constant-time secret validation via `crypto.timingSafeEqual`; deduplication keyed on `eventId`; 3-state lifecycle (`PROCESSING` with 5-minute TTL to prevent deadlocks, closing as `PROCESSED` or `FAILED`). |
| `src/lib/ai/context-builder.ts` | Cache Invalidation | Expanded `recurringDigest` to incorporate `type`, `frequency`, `dayOfMonth`, and `secondDayOfMonth`, triggering immediate cache invalidation in Copilot upon rule modifications. |
| `src/components/BudgetsView.tsx` | User Interface | Clarified frequency labels ("Every 14 days (bi-weekly)" vs "Semi-monthly (2 fixed monthly dates)"); added `secondDayOfMonth` input field. |
| `src/components/OpenFinanceView.tsx` | UX Transparency | Visual indicator explaining that sync checks operate on-demand during navigation or via external system triggers. |
| `tests/sprint7-1-corrections.test.ts` | New Test Suite | 18 deterministic tests covering rolling 30/60/90-day windows, 14-day biweekly vs fixed semimonthly steps, short-month clamping, and accounting contracts (Cases A, B, C). |
| `tests/sprint7-http-500-security.test.ts` | Typing & Cleanup | Removed `any` types for strict linter compliance. |
| `tests/sprint7-sync-and-webhooks.test.ts` | Typing & Cleanup | Enforced `Record<string, unknown>` typing in webhook tests. |

---

## 3. Architectural Decisions & Technical Justifications

### 3.1 Elimination of Fractional Multipliers in Favor of Concrete Occurrences
- **Problem:** Sprint 7 projected weekly flows by multiplying base values by `(52 / 12) = 4.333`, and biweekly flows by `(26 / 12) = 2.166`. This created fractional cent values and ignored whether a given 30-day window contained 4 or 5 occurrences depending on day-of-week boundaries. Additionally, the 30-day horizon mapped rigidly to calendar Month 1 rather than the rolling period starting from current date.
- **Technical Solution:** The engine computes rolling interval `[todayDate, todayDate + N days]`. Eligible occurrences falling inside this range are evaluated individually. If a weekly flow occurs 5 times in 30 days, the projection is `5 * amount`; if it occurs 4 times, it is `4 * amount`.

### 3.2 Detection of Intraday Liquidity Troughs (`lowestProjectedBalance`)
- **Problem:** Comparing only the closing balance at the end of 30 days concealed insolvency risks. For instance: a user with an initial balance of R$ 1,000.00 experiencing an outflow of R$ 1,800.00 on Day 5 and an inflow of R$ 3,000.00 on Day 20 ended the month with positive R$ 2,200.00, but incurred a 15-day overdraft deficit of -R$ 800.00.
- **Technical Solution:** Implemented a chronological running balance algorithm iterating over every date with cash movements in the window. The engine identifies both the minimum balance and its exact calendar date (`lowestProjectedDate`), setting `isNegativeLiquidity = true` whenever the running balance drops below zero.

### 3.3 Pluggy Webhook Secret with Constant-Time Comparison
- **Problem:** Route `/api/pluggy/webhook` accepted unsigned POST requests, allowing arbitrary external callers to forge bank sync events.
- **Technical Solution:** Enforced constant-time buffer comparison (`crypto.timingSafeEqual`) on `x-webhook-secret` (or `authorization: Bearer`) against `PLUGGY_WEBHOOK_SECRET`. Missing or mismatched secrets immediately return HTTP 401 Unauthorized.

### 3.4 Webhook Deduplication Keyed on `eventId`
- **Problem:** Sprint 7 deduplicated using `payloadHash` with an `OR` condition. If Pluggy dispatched two distinct events carrying identical bodies (e.g. repeated `item/updated` pings), the second event was dropped.
- **Technical Solution:** Primary idempotency key is anchored on Pluggy's official `eventId`. The payload hash acts strictly as a secondary fallback when `eventId` is omitted.

---

## 4. Projection Comparison: Legacy Multipliers vs. Discrete Occurrence Model

| Projection Scenario | Sprint 7 Model | Sprint 7.1 Discrete Model | Impact |
| :--- | :--- | :--- | :--- |
| **Weekly expense (R$ 200, 5 occurrences in 30 days)** | Average multiplier: `200 * 4.333 = R$ 866.67` | Discrete sum: `5 * 200 = R$ 1,000.00` | Eliminates R$ 133.33 cash deficit distortion. |
| **Weekly expense (R$ 200, 4 occurrences in 30 days)** | Average multiplier: `200 * 4.333 = R$ 866.67` | Discrete sum: `4 * 200 = R$ 800.00` | Eliminates R$ 66.67 phantom commitment. |
| **Quarterly income (R$ 6,000 in Month 3)** | Average multiplier: `6,000 * 0.333 = R$ 2,000/mo` | Exact date: R$ 0 in months 1 & 2; R$ 6,000 in month 3 | Prevents false liquidity expectations in month 1. |
| **30-day window starting Oct 15** | Rigidly targeted November calendar month | Evaluates continuous window Oct 15 to Nov 14 | Accounts for mid-month obligations. |
| **Intraday liquidity deficit** | Missed if month-end balance was positive | Tracks trough value (`-R$ 800`) and date (`Oct 15`) | Alerts user to fund transfer needs. |

---

## 5. Periodicities and Temporal Behavior

| Frequency | System Code | Temporal Step Rule | Occurrences / Year | Short-Month Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Weekly** | `WEEKLY` | `addDays(date, 7)` | 52 or 53 | Unaffected by month length. |
| **Every 14 days (bi-weekly)** | `BIWEEKLY` | `addDays(date, 14)` | 26 (or 27 if starting Jan 1) | Unaffected by month length; reflects strict 14-day payroll. |
| **Semi-monthly (2 fixed dates)** | `SEMIMONTHLY` | Fixed calendar days (`dayOfMonth` & `secondDayOfMonth`) | Exactly 24 | Clamps Day 31 to 28/29 in Feb and 30 in Apr/Jun/Sep/Nov. |
| **Monthly** | `MONTHLY` | Next calendar month on same day | 12 | Clamps missing days to month-end business day. |
| **Quarterly** | `QUARTERLY` | 3-month step (`totalM + 3`) | 4 | Fires only in competence months. |
| **Annual** | `ANNUAL` / `YEARLY` | 12-month step (`totalM + 12`) | 1 | Fires only in anniversary month. |

---

## 6. Accounting Contracts for Reconciliation

| Use Case | User / System Action | Impact on Current Bank Balance | Impact on Future Projections | Double-Counting Prevention |
| :--- | :--- | :--- | :--- | :--- |
| **Case A: Administrative Confirmation** | User confirms occurrence without linking a transaction | Account balance remains **unchanged** (R$ 5,000 stays R$ 5,000) | Occurrence remains in expected flow until settled | Prevents administrative receipts from inflating liquid cash. |
| **Case B: Manual Transaction** | User manually records debit or credit in ledger | Account balance updates immediately | Pending occurrence is reconciled and removed from future pipeline | Prevents expense from being deducted twice (once from cash, once from projection). |
| **Case C: Real Pluggy Import** | Reconciliation engine matches imported bank transaction | Real balance already accounts for imported row | Occurrence receives `transactionId` and status `RECONCILED` | Disappears from expected amounts across future horizons. |

---

## 7. Webhook Security and Lifecycle

| Phase | State | Rules and Validation | Failure Handling |
| :--- | :--- | :--- | :--- |
| **1. Authentication** | `PRE-AUTH` | Constant-time validation of `PLUGGY_WEBHOOK_SECRET` via `crypto.timingSafeEqual` on headers. | Immediate HTTP 401 Unauthorized with sanitized server log. |
| **2. Initial Deduplication** | `CHECK` | Query `processedWebhookEvents` by `eventId`. If `PROCESSED`, exit with 200 `{ duplicate: true }`. | If `PROCESSING` < 5 min, exit with 200 `{ inFlight: true }`. If > 5 min, reprocess orphan. |
| **3. State Persistence** | `PROCESSING` | Inserts or updates record to `PROCESSING` before initiating account synchronization. | Prevents silent event loss if execution crashes during network sync. |
| **4. Business Execution** | `EXECUTING` | Triggers account and transaction sync for target `itemId` via `syncPluggyItemData`. | Captures provider authentication failures (`LOGIN_ERROR`). |
| **5. Completion** | `PROCESSED` or `FAILED` | Updates state to `PROCESSED` on success, or `FAILED` with persisted `errorMessage`. | Returns HTTP 200 with operation summary to avoid webhook replay spam. |

---

## 8. Sync Scheduler Architecture

| Aspect | Implementation (Sprint 7.1) | Rejected Premise |
| :--- | :--- | :--- |
| **Execution Trigger** | Event-driven and on-demand during UI navigation or via OS cron script (`scripts/sync-worker.ts`). | **In-memory setInterval daemon:** Next.js serverless runtimes do not sustain persistent long-lived timers. |
| **Lock Management** | SQLite `syncLocks` with unique item key and 5-minute TTL to prevent concurrent overlaps. | Concurrent requests do not duplicate sync jobs for the same financial connection. |
| **UX Transparency** | Open Finance interface displays last synchronization timestamp and explicit status indicator. | Users know precisely when and how account statements were fetched. |

---

## 9. Indicator Protections & Edge Cases

| Indicator | Formula | Edge Case Tested | Guaranteed Outcome |
| :--- | :--- | :--- | :--- |
| **`futureCommitmentRatePct`** | `(expectedExpenses / expectedIncome) * 100` | Expected Income = 0, Expenses = R$ 800 | **0%** (prevents division by zero, `NaN`, or false 100%). |
| **`futureCommitmentRatePct`** | `(expectedExpenses / expectedIncome) * 100` | Expected Income = 0, Expenses = 0 | **0%** without error. |
| **`futureCommitmentRatePct`** | `(expectedExpenses / expectedIncome) * 100` | Expenses (R$ 3,000) > Income (R$ 2,000) | **150%** (accurate finite representation of deficit). |
| **`lowestProjectedBalance`** | `min(runningBalance - dailyOutflow)` | Balance R$ 1,000, outflow R$ 1,800 on Day 5, inflow R$ 3,000 on Day 20 | **-R$ 800.00** on Day 5 with `isNegativeLiquidity = true`. |
| **`openingLiquidBalance`** | `sum(checking, savings) - liabilities` | Negative checking balance (overdraft -R$ 2,500) | **-R$ 2,500.00** processed without exceptions. |

---

## 10. Gemini Model Lifecycle Roadmap

| Model in FinAI | Google AI Official Status | Deprecation Date | Sunset Date | Recommended Replacement |
| :--- | :--- | :--- | :--- | :--- |
| **`gemini-3.1-flash-lite`** | **Deprecated** | May 07, 2026 | May 07, 2027 | **`gemini-3.5-flash-lite`** |
| **`gemini-3.5-flash-lite`** | **Active / Stable** | N/A | N/A | Recommended Production Fast |
| **`gemini-3.8-flash`** | **Active / Stable** | N/A | N/A | Recommended Production Advanced |

---

## 11. Test and Verification Summary

- **Global Test Suite:** **178 tests passed across 34 suites (0 failures)**.
- **Mutation Detection:** **13 / 13 mutants eliminated (100% detection rate)**.
- **TypeScript (`npx tsc --noEmit`):** 0 errors.
- **ESLint:** 0 errors (all Sprint 7 and 7.1 files have 0 warnings and 0 errors).
- **Next.js Production Build:** 25 routes generated successfully in Turbopack.
- **Database Safety:** `finai.db` preserved intact with non-destructive migrations.
