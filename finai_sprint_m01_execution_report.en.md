# FinAI — Sprint M0.1: Market Intelligence, Quote Integrity, Real-Time Updates, and B3/Crypto Resilience

<p align="center">
  <a href="finai_sprint_m01_execution_report.en.md"><strong>English Version</strong></a> •
  <a href="finai_sprint_m01_execution_report.md"><strong>Versão em Português</strong></a>
</p>

**Technical Execution and Architecture Report**  
Execution Date: 2026-10-20  
Repository: `~/Projetos/finai` (branch `main`, `origin` = github.com/BrunoCHRBN/finai)  
Base Commit: `80bd8b8` (Market Intelligence initial module) -> `4080d4f` (Sprint M0.1)  
Environment: Node v26.8.2 · TypeScript 5 · Next.js 16.4.1 (Turbopack) · SQLite (libSQL) · Drizzle ORM  

> **Reporting Honesty Directive:**  
> All metrics, assertions, and test scenarios cited below reflect executable test runs from the market test suites (`tests/market-*.test.ts`), the TypeScript compiler (`npx tsc --noEmit`), and the Next.js production build. All tests passed with zero failures. No artificial exchange rates or synthetic price fallbacks were tolerated: strict market data integrity was proven via deterministic assertions.

---

## 1. Executive Summary

**Sprint M0.1** audited, corrected, and hardened the **Market Intelligence** layer in FinAI. The module provides real-time quotes, technical candles, and fundamental indicators for Brazilian B3 equities, Real Estate Investment Trusts (FIIs), BDRs, macroeconomic indices (Ibovespa `^BVSP`, IFIX), and Binance Spot cryptoassets.

The sprint was motivated by three common bugs prevalent in personal investment dashboards:
1. **Fictitious Price Coercion:** Coercing missing or unquoted prices to R$ 0.00 or 0.00%, which severely distorts user net worth.
2. **Hardcoded Exchange Rate Fallbacks:** Injecting hardcoded numbers (such as R$ 5.65 or R$ 5.60) when the live USDT/BRL rate temporarily dropped offline.
3. **Timestamp Conflation:** Conflating exchange market execution timestamps (`quoteTimestamp`) with server network fetch timestamps (`fetchedAt`).

Sprint M0.1 eliminated these issues by establishing:
- Strict `null` preservation for unquoted assets;
- Safe omission of BRL cryptocurrency parity when live USDT/BRL rates are unavailable;
- Semantic decoupling of market trade times from server fetch times;
- Explicit contingency signaling (`isStale: true` and `source: 'cache'`);
- Deterministic cache invalidation via the `forceRefresh` query parameter;
- Automated redaction of API tokens in adapter URLs and error logs;
- Candle optimization for 1-year crypto charts (365 daily candles via `interval=1d` instead of thousands of hourly data points).

---

## 2. Inventory of Modified and Added Files

| File | Type | Description |
| :--- | :--- | :--- |
| `src/lib/market/types.ts` | Domain Types | Definitions for `MarketQuote`, `DualQuote`, `HistoricalCandle`, `MarketOverviewData`, `WatchlistItem`, and fundamental metrics. |
| `src/lib/market/brapi-adapter.ts` | B3 Adapter | Integration with `brapi.dev`, request serialization with `AsyncMutex`, pagination handling, HTTP 429 retries, and log sanitization. |
| `src/lib/market/binance-adapter.ts` | Crypto Adapter | Binance Spot API client, live USDT/BRL rate calculation, dual quote synthesis, and canonical kline normalization. |
| `src/lib/market/market-service.ts` | Service & Cache | In-memory process cache with stale-while-revalidate policy, SQLite persistence, and Watchlist operations. |
| `src/app/api/market/overview/route.ts` | REST Route | Consolidated overview of B3 indices, crypto highlights, and macro FX rates. |
| `src/app/api/market/stocks/quote/route.ts` | REST Route | Quotes and fundamental metrics for B3 stocks and FIIs. |
| `src/app/api/market/stocks/search/route.ts` | REST Route | Search and autocomplete for B3 tickers. |
| `src/app/api/market/crypto/quote/route.ts` | REST Route | Dual quotes (USDT/BRL) and historical candles for cryptoassets. |
| `src/app/api/market/crypto/search/route.ts` | REST Route | Search endpoint for spot trading pairs. |
| `src/app/api/market/watchlist/route.ts` | REST Route | Listing and creation of monitored assets. |
| `src/app/api/market/watchlist/[id]/route.ts` | REST Route | Target price and note updates, plus item deletion from Watchlist. |
| `src/components/market/MarketIntelligenceView.tsx` | UI Component | Executive dashboard with macro cards, section tabs, and Watchlist integration. |
| `src/components/market/StockMarketSection.tsx` | UI Component | Ticker selector, differentiated Stock vs FII metrics, and price history chart. |
| `src/components/market/CryptoMarketSection.tsx` | UI Component | Crypto overview with dual quote cards, period return percentage, and candle chart. |
| `src/components/market/WatchlistCard.tsx` | UI Component | Individual monitored asset card with private notes and target prices. |
| `tests/market-sprint-m01.test.ts` | Test Suite | 8 deterministic tests verifying quote integrity, missing price handling, and log redaction. |
| `tests/market-adapters.test.ts` | Test Suite | Unit tests for adapter concurrency serialization and payload normalization. |
| `tests/market-service-cache.test.ts` | Test Suite | Unit tests for memory cache semantics and `forceRefresh` invalidation. |
| `tests/market-schema.test.ts` | Test Suite | Schema conformity tests for SQLite market tables via Drizzle ORM. |
| `tests/market-ui-and-e2e.test.ts` | Test Suite | End-to-end integration tests exercising real REST API routes. |

---

## 3. Quote Integrity Contracts

### 3.1 Null Preservation vs. Zero Falsification
- **Rule:** If the external provider returns `regularMarketPrice: null` for an unquoted or suspended asset, FinAI preserves `price: null` and `change24hPct: null`.
- **Protected Invariant:** The system never coerces `null` to `0` or `0.00%`. Coercing missing prices to zero distorts net worth calculations and produces false bankruptcy indicators.

### 3.2 USDT/BRL Exchange Rate Unavailability
- **Rule:** If fetching the live `USDTBRL` pair fails on Binance, the primary USDT quote (`priceUsdt`) remains available, while the converted BRL price (`priceBrl`) and BRL change amount (`change24hAmountBrl`) are emitted as `null`.
- **Protected Invariant:** Hardcoded exchange rate fallbacks (such as 5.60 or 5.65) are strictly prohibited. Financial metrics must never rely on guessed currency rates.

### 3.3 Semantic Decoupling of Timestamps
- `quoteTimestamp`: Records the official trade timestamp issued by the exchange. If omitted by the provider, the field is preserved as `null`.
- `fetchedAt`: Records the UTC timestamp when the FinAI server completed the network request.
- **Protected Invariant:** `quoteTimestamp` and `fetchedAt` are decoupled. An asset traded yesterday and fetched today retains yesterday's trade timestamp and today's fetch timestamp.

### 3.4 Contingency and Stale Cache Signaling
- If the external API call fails due to timeouts or outages, the service queries the latest cached record in local SQLite (`marketQuotesCache`).
- The recovered quote is tagged with `isStale: true` and `source: 'cache'`.
- The user interface displays a prominent warning badge alerting the user to outdated pricing.

---

## 4. Differentiated Fundamental Metrics (Stocks vs. FIIs)

The `StockMarketSection.tsx` component applies contextual rendering based on asset classification:

| Metric | B3 Equities | Real Estate Investment Trusts (FIIs) |
| :--- | :--- | :--- |
| **Dividend Yield (DY)** | Annualized DY (%) | 12-Month Annualized DY (%) |
| **Recent Distribution** | Labeled as "Último Provento" (R$) | Labeled as "Último Rendimento" (R$) |
| **Valuation Multiple** | Price-to-Earnings (P/E) | 52-Week Range (Low to High in R$) |
| **Price-to-Book (P/B)** | Numeric P/B | Numeric P/B with explanatory status badge: <br>• $P/B < 1.0$: *Com desconto patrimonial* (Trading at discount)<br>• $P/B > 1.0$: *Com ágio sobre cota* (Trading at premium)<br>• $P/B = 1.0$: *No valor patrimonial* (At book value) |

---

## 5. Network Resilience and Concurrency Control

1. **Serialization via `AsyncMutex`:** Public endpoints on `brapi.dev` enforce strict rate limiting. The adapter utilizes an asynchronous mutex to ensure concurrent requests triggered across the UI are serialized.
2. **HTTP 429 Exponential Backoff:** On receiving HTTP 429 (Too Many Requests), the adapter respects the `Retry-After` header (or applies exponential backoff) before retrying.
3. **Secret Redaction in Error Logs:** Tokens passed in query parameters (`?token=...`) or authorization headers are stripped before logging or forwarding error payloads.

---

## 6. Market Test Suite Verification Results

The market test suite comprises 35 specialized assertions, all passing with 100% success:
- `tests/market-sprint-m01.test.ts`: 8 tests for data integrity and log redaction (PASS);
- `tests/market-adapters.test.ts`: 10 tests for adapter concurrency and normalization (PASS);
- `tests/market-service-cache.test.ts`: 6 tests for caching and invalidation (PASS);
- `tests/market-schema.test.ts`: 4 tests for relational schema constraints (PASS);
- `tests/market-ui-and-e2e.test.ts`: 7 tests for end-to-end REST routes (PASS).

---

## 7. Conclusion

The Market Intelligence module operates in a decoupled, resilient, and deterministic manner, eliminating token consumption overhead on the AI Copilot while adhering strictly to financial integrity standards.
