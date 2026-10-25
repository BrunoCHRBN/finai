# FinAI — Sprint 6: Reliability, Financial Integrity, Security, and Performance Audit

<p align="center">
  <a href="finai_sprint6_execution_report.en.md"><strong>English Version</strong></a> •
  <a href="finai_sprint6_execution_report.md"><strong>Versão em Português</strong></a>
</p>

**Technical Execution Report**  
Execution Date: 2026-10-16  
Repository: `~/Projetos/finai` (branch `main`, `origin` = github.com/BrunoCHRBN/finai)  
Base Commit: `d0b5110`  
Environment: Node v26.8.2 · TypeScript 5 · Next.js 16.4.1 · libSQL/SQLite · Drizzle ORM  

> **Reporting Honesty Directive:** Each metric below reflects real command output. What was not executed is labeled as **PENDING**, never estimated. The phrasing "100% validated" is avoided: the sprint is **validated within local scope**, with real latency against the Google Gemini production API pending active external credentials in the execution environment.
> 
> All 115 automated tests pass, 13/13 rule mutations are detected, production build passes with 0 errors (22 routes), type checking passes with 0 errors, and lint closed with 68 warnings (0 errors and 0 warnings across test files).

---

## 1. Executive Summary

Sprint 6 audited FinAI focusing on financial integrity, Copilot security, multi-model resilience, and execution latency. The starting state was green across test runs, linting, type checking, and compilation — but green was insufficient evidence of correctness. The core objective was **proving test discrimination**.

Mutation measurement result: **13/13 mutants detected**. In the initial round, **1 out of 10 survived**: the cache fingerprint was unprotected because the existing assertion varied two fields simultaneously, each masking the other. This was the primary methodological discovery of the sprint.

Findings and Remediation:

| # | Severity | Finding | State |
|---|---|---|---|
| F1 | P2 | Fingerprint component `stateDigest` was uncovered by tests (masked by redundant field) | **Fixed** (isolated 17-variant test added) |
| F2 | P2 | Type import without `import type` in Copilot route broke standalone ESM execution | **Fixed** (`import type`) |
| F3 | P2 | Client-cancelled SSE stream was emitted as `complete` / `success: true` | **Fixed** (explicit `aborted` terminal event) |
| F4 | P2 | Mid-call client abort was categorized as `error` (server failure) | **Fixed** (distinction between client abort and server error) |
| F5 | P1 | Suspicion that `ADVANCED_FALLBACK = gemini-3.5-flash` was an invalid ID | **Dismissed / Validated** (confirmed in official Google Gemini docs as stable) |
| F6 | P3 | API routes returned raw `error.message` on HTTP 500 | Deferred to Sprint 7 hardening |
| F7 | P3 | Model ID verification in `VERIFIED_GEMINI_MODELS` lacked unit validation | **Fixed** (automated pattern test added) |
| F8 | P3 | Unused imports and `any` types in Sprint 6 test files | **Fixed** (0 warnings in tests; total dropped from 79 to 68) |
| F9 | P3 | `README.md` referenced Gemini 2.5 Flash Lite while code utilized 3.x | Deferred to documentation synchronization |

**Sprint Status: VALIDATED IN LOCAL SCOPE / PENDING EXTERNAL VALIDATION** — All reliability remediations (F1, F2, F3, F4, F7, F8) were implemented and verified through deterministic suites and mutation tests. Model `gemini-3.5-flash` (F5) was confirmed as official and stable. Real-world latency against Gemini production servers remains pending active credentials.

---

## 2. Audited Scope

Audited with executable evidence:

- `src/lib/transactions.ts` — Canonical layer (types, signs, transfer reconciliation, invoice payment, refunds, `isIgnored`).
- `src/lib/ai/math-engine.ts` — Income, expenses, cash flow, currency rounding.
- `src/lib/patrimony-engine.ts` — Net worth, assets, liabilities, credit card, overdraft.
- `src/lib/planning-engine.ts` — Budgets, goals, projections, alerts, `roundCurrency`.
- `src/lib/ai/snapshot-compressor.ts` — Sanitization, fingerprint, cache.
- `src/lib/ai/gemini-client.ts` — Routing, error classification, retry, fallback, telemetry.
- `src/lib/ai/context-builder.ts` — State digest assembly and fingerprinting.
- `src/app/api/ai/chat/route.ts` — Input validation and SSE streaming protocol.
- Full test suite, linter, type checker, and Next.js production build.

**Explicitly Out of Scope:** Multi-user authentication (single-user personal desktop app); monetary storage migration; deterministic math engine replacement.

---

## 3. Initial Repository State

| Item | Measured Value |
|---|---|
| Branch | `main` |
| HEAD | `d0b5110` |
| Sync with `origin/main` | In sync (`0 0`) |
| Local uncommitted changes | None (clean working tree) |
| Tracked files | 67 |
| Database | `finai.db` (315,392 bytes) present and **untouched** during audit |

The user database was neither deleted, recreated, reset, nor overwritten. Integrity queries were strictly read-only. Tests exercising API routes redirected `DATABASE_URL` to temporary files in `os.tmpdir()` prior to module imports.

---

## 4. Test, Lint, Type Check, and Build Baseline

| Metric | Baseline (Before) | Final (After) | Command |
|---|---|---|---|
| Tests — Total | 103 | **115** | `pnpm test` |
| Tests — Passed | 103 | **115** | `pnpm test` |
| Tests — Failed | **0** | **0** | `pnpm test` |
| Tests — Skipped / Todo | 0 / 0 | 0 / 0 | `pnpm test` |
| Lint — Errors | **0** | **0** | `npx eslint` |
| Lint — Warnings | 79 | **68** | `npx eslint` |
| Type Checking | **exit 0** | **exit 0** | `npx tsc --noEmit` |
| Production Build | **exit 0** (22 routes) | **exit 0** (22 routes) | `npx next build` |
| Coverage Tooling | Not installed | — | — |

---

## 5. Risk Matrix

| ID | Risk | Severity | Probability | Financial Impact | Evidence |
|---|---|---|---|---|---|
| F3 | Cancelled stream reported as `complete` / `success: true` | P2 | Medium | None | M11 (mutation) — fixed & verified |
| F4 | Client abort classified as server error | P2 | Medium | None | M12 (mutation) — fixed & verified |
| F1 | Regression in fingerprint serving stale snapshot to Copilot | P2 | Medium | Indirect (outdated advice) | M06 — fixed with 17-variant test |
| F2 | Type import breaking execution outside bundler | P2 | High | None | Fixed with `import type` |
| F5 | Fallback model `gemini-3.5-flash` suspected invalid | P1 | Zero | Dismissed | Confirmed in Gemini API docs |
| F6 | Raw `error.message` returned to client on 500 | P3 | Medium | None | Logged (15 occurrences) |
| F7 | Constant `VERIFIED_*` asserting unverified model IDs | P3 | — | None | Fixed with ID pattern test |
| F8 | Unused imports in test files | P3 | — | None | Fixed; warnings reduced |
| F9 | Documentation diverging from codebase | P3 | — | None | Logged |

---

## 6. Financial Integrity Test Results

### 6.1 The 15 Mandatory Scenarios
Implemented in `tests/sprint6-reliability-audit.test.ts`:
- Scenarios 1–2: Operating income (`CREDIT`) and expenses (`DEBIT`). **PASS**
- Scenario 3: Internal self-transfers between user accounts do not inflate income or expenses. **PASS**
- Scenarios 4–6: Card purchases, invoice payments without double counting, and chargebacks abating expense without inflating revenue. **PASS**
- Scenarios 7–8: `isIgnored = 1` excluded from calculations; restoring to `0` includes it back. **PASS**
- Scenarios 9–12: Manual editing, deletion, PENDING to SETTLED transitions, and sync idempotency. **PASS**
- Scenarios 13–15: Multiple accounts/cards, empty periods without `NaN`, and uncategorized entries. **PASS**
- Arithmetic precision: IEEE-754 edge cases (`0.1 + 0.2`, `19.99 + 0.01`, `1.005`) evaluated without drift. **PASS**

### 6.2 Mutation Testing Verification
Harness: `tests/mutacao/mutate_sprint6.py` (`pnpm run test:mutacao`).

| Mutation | Rule Violated | Detected? | Failed Tests |
|---|---|---|---|
| M01 | Internal transfer counted as operating revenue/expense | **YES** | 2 |
| M02 | Purchase refund fails to abate expense | **YES** | 1 |
| M03 | Credit card invoice payment double-counts expenses | **YES** | 3 |
| M04 | Internal transfer reconciliation disabled | **YES** | 4 |
| M05 | Credit card invoice liability zeroed out | **YES** | 4 |
| M06 | Cache fingerprint ignores `stateDigest` | **YES** (after F1 fix) | 1 |
| M07 | Prompt injection filters disabled | **YES** | 2 |
| M08 | Sensitive field sanitization (CPF/card/tokens) disabled | **YES** | 3 |
| M09 | Auth errors (401/403) marked retryable with fallback | **YES** | 2 |
| M10 | Monetary `roundCurrency` rounding disabled | **YES** | 1 |
| M11 | Aborted stream reported as `complete` | **YES** | 1 |
| M12 | Client cancellation classified as server error | **YES** | 1 |
| M13 | Body validation removed (accepts invalid input) | **YES** | 1 |

**Score: 13/13 mutants detected.**

---

## 7. Patrimonial and Planning Audit

| Check | Method | Result |
|---|---|---|
| Net Worth = Assets − Liabilities | Phase 2 test suite | PASS |
| Credit line limits excluded from assets | Phase 2 test suite + M05 | PASS |
| Overdraft debt treated as liability (`OVERDRAFT_DEBT`) | Phase 2 test suite | PASS |
| Credit card balance treated as short-term liability | Phase 2 test suite + M05 | PASS |
| Internal transfers leave consolidated net worth invariant | Phase 1 scenario 3 | PASS |
| Manual assets/liabilities counted exactly once | Phase 2 test suite | PASS |
| Cascading goals waterfall: R$ 1.00 not allocated twice | Phase 2 test suite | PASS |
| Projections separate Realized / Confirmed / Estimated | Phase 2 test suite | PASS |

---

## 8. Security and Privacy Results

### 8.1 Credentials and Sensitive Information
- Server-side isolation: `getGeminiRuntimeConfig` does not serialize `apiKey`; verified via GET `/api/ai/chat`.
- No `NEXT_PUBLIC_*` leakage for secrets.
- Redaction of CPFs, CNPJs, card numbers, and Bearer tokens via `sanitizeUntrustedText`.
- Sensitive object field stripping via `stripSensitiveFields`.

### 8.2 Cache Isolation and Fingerprinting
Cache key consists of `period` and cryptographic `fingerprint` with a 15-second TTL. The cache is scoped to process memory. Under `F1`, the `stateDigest` calculation was validated across 17 isolated field mutations, ensuring that modifications to descriptions or categories immediately invalidate cached snapshots.

### 8.3 Prompt Injection Hardening
- Untrusted text is neutralized (`[REDACTED_INSTRUCTION]`).
- Sensitive IDs are scrubbed (`[REDACTED_ID]`).
- Financial amounts and dates are preserved.
- The model operates strictly over aggregated snapshots without direct code execution or write permissions.

---

## 9. Gemini Resilience and Streaming Results

### 9.1 Multi-Model Routing (DIRECT / FAST / ADVANCED)
Verified via automated benchmarks:
- Direct arithmetic questions -> `DIRECT` (0 model calls).
- Daily operational questions -> `FAST` (`gemini-3.5-flash-lite`).
- Deep diagnostics and projections -> `ADVANCED` (`gemini-3.8-flash`).

### 9.2 Error Handling and SSE Protocols
- 401/403: Single call, 0 retries, immediate deterministic fallback with `AUTH_CONFIG_ERROR`.
- 429/5xx: Exponential backoff with up to 3 retries before degrading.
- Client cancellation: Emits terminal `aborted` event (`success: false`, `reason: CLIENT_ABORTED`), distinguishing client disconnects from server faults.

---

## 10. Latency Benchmark Summary

Script: `scripts/benchmark-copilot.mjs` (`pnpm run benchmark`).
Parameters: 50 iterations with 10 warmup runs across 8 synthetic scenarios.

### Layer A — Internal Execution (Zero Network)
- Snapshot Generation: p50 = 0.10 ms.
- Deterministic Synthesis: p50 = 0.60 ms.
- Aggregate Internal Overhead: **p50 = 0.87 ms, p95 = 0.99 ms, p99 = 0.99 ms** (n = 400).

### Layer B — Simulated Provider (25 ms Mock Latency)
- Direct Route (`DIRECT`): 0.80 ms (0 calls).
- Fast Route (`FAST`): 25.83 ms (1 call).
- Advanced Route (`ADVANCED`): 25.85 ms (1 call).
- Provider 503 Outage: 0.97 ms (3 retries followed by deterministic fallback).

### Layer C — Real External Network
Status: `PENDING_CREDENTIALS` (requires active `GEMINI_API_KEY` in environment).

---

## 11. Reproducibility

```bash
cd ~/Projetos/finai

# 1. Full test suite (115 tests)
pnpm test

# 2. Mutation verification harness (13 mutants)
pnpm run test:mutacao

# 3. Linter, type check, and build
npx eslint
npx tsc --noEmit
npx next build

# 4. Latency benchmark
pnpm run benchmark
```
