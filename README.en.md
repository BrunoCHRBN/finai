# FinAI • Institutional Financial Terminal with Token-Optimized AI

<p align="center">
  <strong>Desktop-first personal financial operating system, balance sheet manager, market intelligence terminal, and strategic advisory platform integrated with Open Finance Brasil (Pluggy API v2), B3, Binance, and Google Gemini 3 multi-model routing.</strong>
</p>

<p align="center">
  <a href="README.en.md"><strong>English Version</strong></a> •
  <a href="README.md"><strong>Versão em Português</strong></a>
</p>

---

## 1. Overview and Architectural Philosophy

Most personal finance applications attempting to integrate Large Language Models (LLMs) suffer from a fundamental engineering flaw: they feed thousands of raw transaction rows directly into the model context window. This pattern introduces three major failure modes:
1. Skyrocketing API costs caused by token waste across repetitive, volatile rows;
2. Arithmetic hallucinations in summations, percentages, and averages (LLMs are not deterministic calculators);
3. Verbose, generic responses saturated with corporate cliches (*AI slop*).

**FinAI** reverses this approach through a layered architecture where numerical processing and accounting constraints run locally on deterministic engines consuming 0 tokens. The AI model is engaged exclusively for qualitative assessments and tactical consulting, operating over a compressed, structured snapshot.

```
┌────────────────────────────────────────────────────────┐
│ 1. LOCAL DETERMINISTIC MATH ENGINE (0 TOKENS)          │
│    • Net Worth, Runway, Savings Rate, Asset Allocation │
│    • 50/30/20 Matrix, Budget Variance, P/B Multiples   │
│    • Transfer Reconciliation & 30/60/90-Day Projections│
└──────────────────────────┬─────────────────────────────┘
                           │ Structured metrics
┌──────────────────────────▼─────────────────────────────┐
│ 2. SYNTHETIC SNAPSHOT COMPRESSOR (< 180 TOKENS)        │
│    • Consolidated vector (Balance Sheet, Deltas,       │
│      Critical Categories, Solvency & Burn Rate)        │
│    • Cache invalidation via cryptographic fingerprint  │
└──────────────────────────┬─────────────────────────────┘
                           │ Serialized snapshot
┌──────────────────────────▼─────────────────────────────┐
│ 3. MULTI-MODEL COPILOT (GEMINI 3 ARCHITECTURE)         │
│    • Dynamic routing: DIRECT (0 tokens),               │
│      FAST (gemini-3.5-flash-lite) & ADVANCED (3.8-flash│
│    • Anti-AI-Slop Editorial Directive v2               │
│    • Structured JSON output & SSE streaming            │
└────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

- **Web Framework & Runtime:** Next.js 16.4.1 (App Router, Turbopack, React 19, TypeScript 5).
- **Styling & User Interface:** Tailwind CSS, Lucide Icons, Recharts, `font-variant-numeric: tabular-nums`.
- **Database & ORM:** SQLite / LibSQL with Drizzle ORM (`finai.db` locally hosted, with idempotent schema migrations applied at startup).
- **Open Finance Brasil:** Pluggy API v2 (certified bank connectors, checking accounts, credit cards, bank statements, and OAuth bridge via MeuPluggy - Connector 200).
- **Market Data Providers:**
  - `brapi.dev`: B3 Stocks, Real Estate Investment Trusts (FIIs), BDRs, and macroeconomic indices (Ibovespa, IFIX) with concurrency control via `AsyncMutex` and stale-while-revalidate caching.
  - `Binance Spot API`: Real-time spot quotes, BRL parity via the live USDT/BRL exchange rate, and historical candlestick klines.
- **Artificial Intelligence:** Google Gemini 3 Architecture via the official `@google/genai` SDK:
  - Primary Fast Model: `gemini-3.5-flash-lite` (Fallback: `gemini-3.1-flash-lite`).
  - Primary Advanced Analytical Model: `gemini-3.8-flash` (Fallback: `gemini-3.6-flash`).
  - Local Deterministic Route (`DIRECT`): 0 tokens consumed for direct arithmetic inquiries.

---

## 3. Platform Modules

### A. Patrimonial Terminal & Balance Sheet (`PatrimonyView`)
- **Consolidated Net Worth:** Real-time evaluation of the core accounting identity $\text{Net Worth} = \text{Assets} - \text{Liabilities}$.
- **Asset Aggregation:** Checking accounts, emergency funds, investment brokerages, and manual physical assets (real estate, vehicles, equity holdings).
- **Liability Aggregation:** Outstanding credit card invoice balances, overdraft credit facilities (`OVERDRAFT_DEBT`), structured debt, and mortgages.
- **Credit Limit Isolation:** Total credit card limits granted by financial institutions are strictly excluded from asset calculations.
- **Historical Snapshots:** Time-series tracking of net worth evolution broken down by asset class (Fixed Income, Equities, Real Estate, Crypto, and Cash).

### B. Canonical Ledger & Tabular Reconciliation (`TransactionsView`)
- **Sign Normalization:** Operating credits standardized as positive values (`CREDIT`), operating debits as negative values (`DEBIT`).
- **Internal Self-Transfer Neutrality (`detectAndReconcileSelfTransfers`):** Deterministic matching of paired outflows and inflows between accounts belonging to the same user, preventing internal money movements from inflating income or expenses.
- **Invoice Payment Neutrality:** Paying a credit card bill from a checking account is reconciled as neutral, preventing duplicate expense accounting.
- **Refunds & Reversals:** Refunds abate category expense totals rather than inflating gross operating income.
- **Ignored Transactions (`is_ignored`):** Selective exclusion of one-off transactions from metrics and budgets without deleting audit records.
- **Atomic Manual Operations:** Inserting, editing, and deleting manual transactions automatically adjusts account balances in an isolated SQLite transaction.

### C. Financial Planning, Multi-Atomic Recurrences & Projections (`BudgetsView`)
- **Recurring Flow Management:** Master rules (`recurring_flows`) configurable by direction (`INCOME` or `EXPENSE`), nature (`FIXED` or `VARIABLE`), and accounting category.
- **Six Supported Frequencies:**
  - `WEEKLY`: Strict 7-day step;
  - `BIWEEKLY`: Strict 14-day step (26 occurrences/year, aligning with biweekly payroll schedules);
  - `SEMIMONTHLY`: Two fixed calendar dates (`dayOfMonth` and `secondDayOfMonth`, 24 occurrences/year);
  - `MONTHLY`: Monthly interval with day-of-month anchoring and end-of-month business-day clamping for short months;
  - `QUARTERLY`: 3-month step;
  - `ANNUAL` / `YEARLY`: 12-month step;
  - `ONCE`: Discrete expected entry.
- **Discrete Occurrences (`recurring_occurrences`):** Stable primary key formatted as `occ_{flowId}_{expectedDate}`, replacing static fractional multipliers with discrete temporal units.
- **Rolling Cash Flow Projections (30, 60, and 90 Days):** Real-time evaluation of discrete inflows and outflows starting from a reference date, calculating expected inflows, expected outflows, projected closing balances, and intraday liquidity troughs (`lowestProjectedBalance` with `isNegativeLiquidity` flag).
- **Deterministic Reconciliation Engine:** Multi-criteria scoring algorithm (temporal tolerance $\pm 5$ days, monetary tolerance in cents, account matching, and normalized string similarity) with automated ambiguity locks (`isAmbiguous` if candidate score delta is under $0.15$).
- **Strict 4-State Epistemic Separation:**
  1. `REALIZED`: Settled bank ledger transaction;
  2. `EXPECTED`: Future occurrence generated by recurring schedule;
  3. `CONFIRMED`: Administrative receipt confirmation without duplicating bank rows;
  4. `PROJECTED`: Estimated future cash balance.
- **8-Indicator Executive Rule:** Realized income, expected income, active recurring baseline, overdue unreconciled income, expected expenses, projected closing balance, future commitment rate (`futureCommitmentRatePct`, protected against zero division), and budget variance.

### D. Market Intelligence & Asset Quotes (`MarketIntelligenceView`)
- **B3 Equities, FIIs, BDRs, and Market Indices:**
  - Real-time and end-of-day quotes via `brapi.dev`;
  - Concurrency serialization with `AsyncMutex` to avoid HTTP 429 rate limits;
  - In-memory cache with stale-while-revalidate semantics;
  - Fundamental metrics for stocks: Price-to-Earnings (P/E), Price-to-Book (P/B), Dividend Yield (DY), and 52-Week Range;
  - Fundamental metrics for Real Estate Trusts (FIIs): 12-month Dividend Yield, Last Distributed Dividend, and P/VP analysis with explicit premium/discount labeling.
- **Binance Spot Cryptoassets:**
  - Live spot tickers for high-liquidity digital assets (BTC, ETH, SOL, BNB);
  - BRL parity conversion evaluated against the live USDT/BRL rate;
  - Historical candlestick charts with selectable ranges (`1d`, `7d`, `1m`, `1y`) and automated period return percentage calculations.
- **Integrated Watchlist:**
  - Persistence of monitored B3 stocks and crypto pairs in SQLite;
  - Target price annotations and private tactical notes.

### E. Strategic Financial Copilot (`CopilotView`)
- **Dynamic Multi-Model Routing:**
  - `DIRECT`: Direct arithmetic questions answered in 0 tokens by the local engine;
  - `FAST`: Routine questions routed to `gemini-3.5-flash-lite`;
  - `ADVANCED`: Deep patrimonial audits, stress scenarios, and cash runway analysis routed to `gemini-3.8-flash`.
- **Snapshot Compression (< 180 Tokens):** Distills balance sheets, cash flow, and recurring commitments into a token-efficient vector.
- **Deterministic Cache Fingerprinting:** Cryptographic hash combining period, rule revisions, and data digests (`stateDigest` and `recurringDigest`), triggering immediate cache invalidation upon any ledger edit.
- **Input Sanitization & Secret Redaction:** Automated removal of CPFs, CNPJs, bank account numbers, card numbers, and API tokens prior to payload serialization, with prompt-injection filtering on transaction descriptions.
- **Server-Sent Events (SSE) Streaming:** Progressive response stream featuring early route classification and an explicit terminal `aborted` event on client disconnection.

### F. Open Finance Brasil Integration (`OpenFinanceView`)
- **Automated Bank Aggregation:** Direct integration with Brazilian financial institutions via Pluggy API v2.
- **MeuPluggy OAuth Bridge (Connector 200):** Enables individual retail users to aggregate accounts with no custom infrastructure.
- **Secure Idempotent Webhooks:** Endpoint `/api/pluggy/webhook` hardened with constant-time secret comparison (`crypto.timingSafeEqual`), primary deduplication by `eventId`, and concurrency locks with 5-minute TTL.
- **Sandbox Environment:** Local verification support through the `Pluggy Bank` test connector (`user-ok` / `password-ok`).

---

## 4. Local Deterministic Math Engine (0 Tokens)

Key balance sheet calculations are evaluated locally in `src/lib/ai/math-engine.ts`, guaranteeing strict numerical consistency:

$$\text{Net Cash Flow} = \sum \text{Operating Inflows} - \sum \text{Operating Outflows}$$

$$\text{Savings Rate (\%)} = \left( \frac{\text{Investments} + \text{Operating Surplus}}{\text{Total Income}} \right) \times 100$$

$$\text{Survival Runway (Months)} = \frac{\text{Total Available Liquid Cash}}{\text{Monthly Essential Fixed Expenses}}$$

$$\text{Budget Variance (\%)} = \left( \frac{\text{Actual Expense} - \text{Planned Ceiling}}{\text{Planned Ceiling}} \right) \times 100$$

$$\text{Future Commitment Rate (\%)} = \begin{cases} 0\%, & \text{if } \text{Expected Income} = 0 \\ \left( \frac{\text{Expected Expenses}}{\text{Expected Income}} \right) \times 100, & \text{if } \text{Expected Income} > 0 \end{cases}$$

---

## 5. Anti-AI-Slop Editorial Directive (v2)

Copilot diagnostics and UI textual outputs follow rigorous editorial standards:
1. **No Artificial Parataxis:** Ideas are connected with natural conjunctions, subordinate clauses, and appropriate punctuation, rejecting robotic chains of disjointed sentences.
2. **No Arbitrary Rule-of-Three:** Enumerations and observations contain only the items necessitated by factual context.
3. **No Fluff or Corporate Rhetoric:** Avoids empty praise, dramatic metaphors, and condescending language. Financial observations communicate data, budget variances, and solvency risks plainly.
4. **Concrete Precision:** All monetary figures reference exact Brazilian Reais amounts with two decimal places, tying observations to concrete dates and counterparty names.

---

## 6. Security, Privacy and Hardening

- **Local-First Trust Boundary:** FinAI is built as a single-user local platform. Financial data lives in the local SQLite database (`finai.db`), excluded from version control via `.gitignore`.
- **Server-Isolated Credentials:** Secrets (`GEMINI_API_KEY`, `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET`) are never exposed to client bundles or prefixed with `NEXT_PUBLIC_`.
- **HTTP 500 Sanitization (`handleApiError`):** Production API routes never return raw `error.message` strings to clients. Technical stack traces and internal paths are logged server-side with sensitive redaction (`redactSensitive`), returning an opaque request identifier.
- **Constant-Time Verification:** Webhooks authenticate payloads using `crypto.timingSafeEqual` over aligned buffers to prevent timing attacks.
- **No Banking Credential Custody:** Open Finance authentication is handled entirely by Pluggy's regulated infrastructure under Central Bank of Brazil compliance.

---

## 7. Repository Structure and API Route Catalog

```
finai/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── ai/
│   │   │   │   ├── chat/route.ts                # SSE streaming and Copilot chat
│   │   │   │   └── diagnose/route.ts            # Structured JSON diagnostic
│   │   │   ├── budgets/route.ts                 # CRUD for budget limits
│   │   │   ├── financial-summary/route.ts       # Consolidated balance and cash flow
│   │   │   ├── goals/[id]/route.ts              # Financial goal update/delete
│   │   │   ├── goals/route.ts                   # Financial goal listing/create
│   │   │   ├── market/
│   │   │   │   ├── crypto/quote/route.ts        # Crypto spot quote and klines
│   │   │   │   ├── crypto/search/route.ts       # Crypto trading pair search
│   │   │   │   ├── overview/route.ts            # Market overview (B3 + Crypto + Macro)
│   │   │   │   ├── stocks/quote/route.ts        # B3 quotes and fundamental metrics
│   │   │   │   ├── stocks/search/route.ts       # Stock and FII ticker search
│   │   │   │   ├── watchlist/[id]/route.ts      # Watchlist item update/delete
│   │   │   │   └── watchlist/route.ts           # Watchlist listing/insert
│   │   │   ├── patrimony/
│   │   │   │   ├── assets/[id]/route.ts         # Manual asset update/delete
│   │   │   │   ├── assets/route.ts              # Manual asset creation
│   │   │   │   ├── liabilities/[id]/route.ts    # Manual liability update/delete
│   │   │   │   ├── liabilities/route.ts         # Manual liability creation
│   │   │   │   ├── snapshots/route.ts           # Historical patrimonial snapshots
│   │   │   │   └── route.ts                     # Current balance sheet summary
│   │   │   ├── planning/
│   │   │   │   ├── occurrences/reconcile/route.ts # Deterministic reconciliation
│   │   │   │   ├── occurrences/route.ts         # Occurrence query and scoring
│   │   │   │   ├── recurring/[id]/route.ts      # Recurring flow update & occurrence rebuild
│   │   │   │   ├── recurring/route.ts           # Recurring rule creation
│   │   │   │   └── route.ts                     # 30/60/90-day cash flow projections
│   │   │   ├── pluggy/
│   │   │   │   ├── connect-token/route.ts       # Pluggy widget session generation
│   │   │   │   ├── connectors/route.ts          # Supported banking connectors
│   │   │   │   ├── sync/route.ts                # Account sync and statement import
│   │   │   │   └── webhook/route.ts             # Hardened idempotent webhook receiver
│   │   │   └── transactions/[id]/route.ts       # Atomic manual edit/delete
│   │   │   └── transactions/route.ts            # Manual entry and ledger filters
│   │   ├── globals.css                          # Design tokens and base styles
│   │   ├── layout.tsx                           # Root layout and typography
│   │   └── page.tsx                             # Main desktop App Shell
│   ├── components/
│   │   ├── market/
│   │   │   ├── CryptoMarketSection.tsx          # Crypto section and candlestick view
│   │   │   ├── MarketIntelligenceView.tsx       # Market overview and macro indicators
│   │   │   ├── StockMarketSection.tsx           # B3 stock and FII section
│   │   │   └── WatchlistCard.tsx                # Monitored ticker card
│   │   ├── ui/
│   │   │   ├── EmptyState.tsx                   # Standardized empty state view
│   │   │   ├── FinancialDataTable.tsx           # Ledger table with tabular figures
│   │   │   ├── MetricCard.tsx                   # Metric card component
│   │   │   ├── PageHeader.tsx                   # Reusable view header
│   │   │   └── StatusBadge.tsx                  # Operational status badge
│   │   ├── BudgetsView.tsx                      # Budgets, goals, and recurring flows
│   │   ├── CommandPalette.tsx                   # Quick command palette (Ctrl+K)
│   │   ├── CopilotView.tsx                      # AI advisory and consultation view
│   │   ├── DashboardView.tsx                    # Executive summary dashboard
│   │   ├── Header.tsx                           # Top bar and synchronization status
│   │   ├── NewPatrimonialItemModal.tsx          # Manual asset/liability modal
│   │   ├── NewTransactionModal.tsx              # Manual transaction modal
│   │   ├── OpenFinanceView.tsx                  # Bank connection management
│   │   ├── PatrimonyView.tsx                    # Detailed balance sheet view
│   │   ├── PluggyConnectModal.tsx               # Open Finance authentication modal
│   │   ├── Sidebar.tsx                          # Persistent desktop sidebar
│   │   └── TransactionsView.tsx                 # Analytical ledger view
│   ├── db/
│   │   ├── index.ts                             # LibSQL connection & idempotent migrations
│   │   └── schema.ts                            # Relational schema (Drizzle ORM)
│   └── lib/
│       ├── ai/
│       │   ├── context-builder.ts               # Context aggregation and digests
│       │   ├── gemini-client.ts                 # Google Gemini 3 multi-model client
│       │   ├── math-engine.ts                   # Local deterministic math (0 tokens)
│       │   └── snapshot-compressor.ts           # Snapshot compressor (< 180 tokens)
│       ├── market/
│       │   ├── binance-adapter.ts               # Binance Spot adapter
│       │   ├── brapi-adapter.ts                 # B3 market adapter with AsyncMutex
│       │   ├── market-service.ts                # In-memory quote cache & consolidation
│       │   └── types.ts                         # Canonical market domain types
│       ├── api-error.ts                         # Standardized API error handling
│       ├── patrimony-engine.ts                  # Balance sheet & liquidity calculations
│       ├── planning-engine.ts                   # Rolling projections & reconciliation
│       ├── pluggy.ts                            # Pluggy API v2 client
│       ├── recurring-engine.ts                  # Gregorian calendar math & occurrence engine
│       └── transactions.ts                      # Canonical transaction normalization
├── tests/
│   ├── mutacao/
│   │   └── mutate_sprint6.py                    # Mutation testing harness
│   ├── alias-hooks.mjs                          # Test import resolution hooks
│   ├── alias-register.mjs                       # ESM loader registration
│   ├── copilot-ai.test.ts                       # Copilot integration tests
│   ├── market-adapters.test.ts                  # Market data adapter tests
│   ├── market-schema.test.ts                    # Market schema tests
│   ├── market-service-cache.test.ts             # Market cache & concurrency tests
│   ├── market-sprint-m01.test.ts                # Sprint M0.1 integrity suite
│   ├── market-ui-and-e2e.test.ts                # Market end-to-end integration tests
│   ├── patrimony.test.ts                        # Balance sheet engine tests
│   ├── planning.test.ts                         # Planning & projection tests
│   ├── pluggy-sync.test.ts                      # Bank sync tests
│   ├── sprint6-reliability-audit.test.ts        # Reliability & financial invariant tests
│   ├── sprint6-streaming-abort.test.ts          # SSE streaming abort tests
│   ├── sprint6-streaming-and-endpoints.test.ts  # Streaming protocol tests
│   ├── sprint7-financial-integrity.test.ts      # Accounting integrity tests
│   ├── sprint7-http-500-security.test.ts        # HTTP 500 security tests
│   ├── sprint7-income-and-occurrences.test.ts   # Income & occurrence tests
│   ├── sprint7-reconciliation.test.ts           # Deterministic reconciliation tests
│   ├── sprint7-sync-and-webhooks.test.ts        # Webhook security tests
│   ├── sprint7-1-corrections.test.ts            # Sprint 7.1 regression tests
│   └── transactions-flow.test.ts                # Transaction normalization flow tests
├── scripts/
│   └── benchmark-copilot.mjs                    # Copilot latency benchmark script
├── .env.example                                 # Environment variable template
├── package.json                                 # Manifest and dependencies
├── pnpm-lock.yaml                               # Reproducible lockfile
└── README.md                                    # Portuguese primary documentation
```

---

## 8. Local Setup Instructions

### Prerequisites
- **Node.js** v20+ installed (validated against Node v20 and v26);
- **pnpm** package manager installed (`npm install -g pnpm`).

### Step-by-Step Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/BrunoCHRBN/finai.git
   cd finai
   ```

2. **Install project dependencies:**
   ```bash
   pnpm install
   ```

3. **Configure environment variables:**
   Copy the sample environment file to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Populate the credentials:
   ```env
   # Open Finance Brasil (Pluggy API v2)
   PLUGGY_CLIENT_ID=your_client_id_here
   PLUGGY_CLIENT_SECRET=your_client_secret_here
   PLUGGY_BASE_URL=https://api.pluggy.ai
   PLUGGY_WEBHOOK_SECRET=your_webhook_secret_here

   # Google Gemini API
   GEMINI_API_KEY=your_gemini_api_key_here

   # Market Data Providers (Optional - brapi provides a free tier without a token)
   BRAPI_API_KEY=your_optional_brapi_token
   ```

4. **Launch development server:**
   ```bash
   pnpm run dev
   ```

5. **Open application:**
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser. The local SQLite database (`finai.db`) initializes automatically and applies schema migrations in a non-destructive manner.

---

## 9. Automated Testing, Mutation Suite & Benchmarking

### Automated Test Suite Execution
The repository includes 213 unit, integration, and flow tests distributed across 41 suites, executed via Node.js native test runner:
```bash
pnpm test
```

### Mutation Testing Harness
To prove test discrimination against real-world regressions, the repository includes a custom mutation harness (`tests/mutacao/mutate_sprint6.py`) that introduces 13 critical business logic mutations:
```bash
pnpm run test:mutacao
```
*Detection Rate: 13/13 mutants detected and killed (100%).*

### Type Checking and Production Build
```bash
# TypeScript compiler verification
npx tsc --noEmit

# Static code analysis with ESLint
pnpm run lint

# Next.js production build (28 static and dynamic routes)
pnpm run build
```

### Copilot Latency Benchmarking
Measures p50, p95, and p99 percentiles across synthetic scenarios on local (0 network) and simulated provider layers:
```bash
pnpm run benchmark
```

---

## 10. Sprint Technical Execution Reports

For deep-dive technical reports documenting audits, mutation tests, accounting contracts, and performance benchmarks for each development cycle:

- [Sprint 6: Reliability, Integrity & Security Audit](finai_sprint6_execution_report.md) • [English](finai_sprint6_execution_report.en.md)
- [Sprint 7: Multi-Atomic Recurrences, Projections & Reconciliation](finai_sprint7_execution_report.md) • [English](finai_sprint7_execution_report.en.md)
- [Sprint 7.1: Corrective Review & Security Hardening](finai_sprint7_1_execution_report.md) • [English](finai_sprint7_1_execution_report.en.md)
- [Sprint M0.1: B3 & Crypto Market Intelligence with Resilient Caching](finai_sprint_m01_execution_report.md) • [English](finai_sprint_m01_execution_report.en.md)

---

## 11. License

This project is licensed under the terms of the [MIT License](LICENSE).
