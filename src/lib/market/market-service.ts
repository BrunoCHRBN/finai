/**
 * FinAI Market Service — Hybrid Cache (Memory + SQLite) & Domain Orchestrator
 *
 * Implements:
 * - Two-tier caching: Fast in-memory Map (60s) + Persistent SQLite `market_quotes_cache` (5 min).
 * - Automatic cataloging in `market_assets` table.
 * - Stale-while-revalidate fallback: Returns last known quote with isStale=true on provider outages.
 * - Dual-quoting for Crypto with dynamic USDT/BRL rate.
 * - Watchlist management and Market Overview aggregation.
 */

import { db, ensureDbInitialized } from '../../db/index.ts';
import { marketAssets, marketQuotesCache, marketWatchlist } from '../../db/schema.ts';
import { eq, inArray, desc } from 'drizzle-orm';
import type {
  MarketAsset,
  MarketQuote,
  CryptoDualQuote,
  HistoricalCandle,
  MarketWatchlistItem,
  MarketOverviewSummary,
} from './types.ts';
import {
  fetchBrapiQuotes,
  searchBrapiAssets,
  type BrapiAdapterConfig,
} from './brapi-adapter.ts';
import {
  fetchCryptoDualQuotes,
  searchPopularCryptoAssets,
  POPULAR_CRYPTO_SYMBOLS,
  type BinanceAdapterConfig,
} from './binance-adapter.ts';

// Configurable TTL
const DEFAULT_PERSISTENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MEMORY_CACHE_TTL_MS = 60 * 1000; // 60 seconds

interface MemoryCacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
}

const memoryQuotesCache = new Map<string, MemoryCacheEntry<MarketQuote>>();
const memoryCryptoQuotesCache = new Map<string, MemoryCacheEntry<CryptoDualQuote>>();
let memoryUsdtBrlRateCache: { rate: number; expiresAt: number } | null = null;

function getPersistentCacheTtlMs(): number {
  const envSeconds = process.env.MARKET_CACHE_TTL_SECONDS;
  if (envSeconds) {
    const parsed = parseInt(envSeconds, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed * 1000;
    }
  }
  return DEFAULT_PERSISTENT_CACHE_TTL_MS;
}

/**
 * Upserts discovered market assets into the `market_assets` SQLite table.
 */
export async function upsertMarketAssets(assets: MarketAsset[]): Promise<void> {
  if (!assets || assets.length === 0) return;
  await ensureDbInitialized();

  for (const asset of assets) {
    try {
      await db
        .insert(marketAssets)
        .values({
          id: asset.id,
          symbol: asset.symbol,
          name: asset.name,
          assetType: asset.assetType,
          market: asset.market,
          currency: asset.currency,
          logoUrl: asset.logoUrl || null,
          sector: asset.sector || null,
          subType: asset.subType || null,
          updatedAt: asset.updatedAt,
        })
        .onConflictDoUpdate({
          target: marketAssets.id,
          set: {
            name: asset.name,
            assetType: asset.assetType,
            logoUrl: asset.logoUrl || null,
            sector: asset.sector || null,
            subType: asset.subType || null,
            updatedAt: asset.updatedAt,
          },
        });
    } catch (err) {
      console.warn(`[MarketService] Failed to upsert asset ${asset.id}:`, err);
    }
  }
}

/**
 * Writes or updates quotes in the persistent SQLite `market_quotes_cache` table.
 */
export async function persistQuotesCache(quotes: MarketQuote[]): Promise<void> {
  if (!quotes || quotes.length === 0) return;
  await ensureDbInitialized();

  for (const q of quotes) {
    try {
      await db
        .insert(marketQuotesCache)
        .values({
          id: q.id,
          assetId: q.assetId,
          price: q.price,
          change24hPct: q.change24hPct,
          change24hAmount: q.change24hAmount,
          dayHigh: q.dayHigh || null,
          dayLow: q.dayLow || null,
          volume24h: q.volume24h || null,
          marketCap: q.marketCap || null,
          quoteTimestamp: q.quoteTimestamp,
          fetchedAt: q.fetchedAt,
          rawPayloadJson: q.rawMetrics ? JSON.stringify(q.rawMetrics) : null,
        })
        .onConflictDoUpdate({
          target: marketQuotesCache.id,
          set: {
            price: q.price,
            change24hPct: q.change24hPct,
            change24hAmount: q.change24hAmount,
            dayHigh: q.dayHigh || null,
            dayLow: q.dayLow || null,
            volume24h: q.volume24h || null,
            marketCap: q.marketCap || null,
            quoteTimestamp: q.quoteTimestamp,
            fetchedAt: q.fetchedAt,
            rawPayloadJson: q.rawMetrics ? JSON.stringify(q.rawMetrics) : null,
          },
        });
    } catch (err) {
      console.warn(`[MarketService] Failed to persist quote cache for ${q.id}:`, err);
    }
  }
}

/**
 * Retrieves quotes for Brazilian (B3) assets using 2-tier cache and stale fallback.
 */
export async function getB3Quotes(
  symbols: string[],
  options?: {
    range?: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y';
    interval?: '1d' | '1h' | '15m';
    forceRefresh?: boolean;
    brapiConfig?: BrapiAdapterConfig;
  }
): Promise<{
  quotes: MarketQuote[];
  assets: MarketAsset[];
  candlesBySymbol: Record<string, HistoricalCandle[]>;
}> {
  await ensureDbInitialized();
  const cleanedSymbols = symbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (cleanedSymbols.length === 0) {
    return { quotes: [], assets: [], candlesBySymbol: {} };
  }

  const now = Date.now();
  const persistentTtl = getPersistentCacheTtlMs();
  const quotesResult: MarketQuote[] = [];
  const missingSymbols: string[] = [];

  // 1. Check in-memory cache first if not forceRefresh
  if (!options?.forceRefresh) {
    for (const sym of cleanedSymbols) {
      const assetId = `B3:${sym}`;
      const memEntry = memoryQuotesCache.get(assetId);
      if (memEntry && memEntry.expiresAt > now) {
        quotesResult.push(memEntry.data);
      } else {
        missingSymbols.push(sym);
      }
    }
  } else {
    missingSymbols.push(...cleanedSymbols);
  }

  // 2. Check persistent SQLite cache for missing symbols
  if (missingSymbols.length > 0 && !options?.forceRefresh) {
    const missingAssetIds = missingSymbols.map((s) => `B3:${s}`);
    const cachedRows = await db
      .select()
      .from(marketQuotesCache)
      .where(inArray(marketQuotesCache.id, missingAssetIds));

    const stillNeeded: string[] = [];

    for (const sym of missingSymbols) {
      const assetId = `B3:${sym}`;
      const row = cachedRows.find((r) => r.id === assetId);

      if (row) {
        const fetchedTime = new Date(row.fetchedAt).getTime();
        const isFresh = now - fetchedTime < persistentTtl;

        const rawMetrics = row.rawPayloadJson ? JSON.parse(row.rawPayloadJson) : null;
        const quote: MarketQuote = {
          id: row.id,
          assetId: row.assetId,
          price: row.price,
          change24hPct: row.change24hPct,
          change24hAmount: row.change24hAmount,
          dayHigh: row.dayHigh,
          dayLow: row.dayLow,
          volume24h: row.volume24h,
          marketCap: row.marketCap,
          quoteTimestamp: row.quoteTimestamp,
          fetchedAt: row.fetchedAt,
          isStale: !isFresh,
          rawMetrics,
        };

        if (isFresh) {
          quotesResult.push(quote);
          memoryQuotesCache.set(assetId, {
            data: quote,
            cachedAt: now,
            expiresAt: now + MEMORY_CACHE_TTL_MS,
          });
        } else {
          stillNeeded.push(sym);
        }
      } else {
        stillNeeded.push(sym);
      }
    }

    missingSymbols.length = 0;
    missingSymbols.push(...stillNeeded);
  }

  // 3. Fetch missing symbols from brapi external provider
  let freshAssets: MarketAsset[] = [];
  let candlesBySymbol: Record<string, HistoricalCandle[]> = {};

  if (missingSymbols.length > 0) {
    try {
      const brapiRes = await fetchBrapiQuotes(
        missingSymbols,
        {
          range: options?.range || '1mo',
          interval: options?.interval || '1d',
          fundamental: true,
        },
        options?.brapiConfig
      );

      // Persist discovered assets and quotes
      await upsertMarketAssets(brapiRes.assets);
      await persistQuotesCache(brapiRes.quotes);

      // Populate memory cache
      for (const q of brapiRes.quotes) {
        memoryQuotesCache.set(q.assetId, {
          data: q,
          cachedAt: now,
          expiresAt: now + MEMORY_CACHE_TTL_MS,
        });
        quotesResult.push(q);
      }

      freshAssets = brapiRes.assets;
      candlesBySymbol = brapiRes.historicalCandlesBySymbol;
    } catch (error) {
      console.warn('[MarketService] brapi fetch failed, attempting stale fallback:', error);

      // Stale-while-revalidate fallback: read whatever is in DB even if expired
      const fallbackAssetIds = missingSymbols.map((s) => `B3:${s}`);
      const staleRows = await db
        .select()
        .from(marketQuotesCache)
        .where(inArray(marketQuotesCache.id, fallbackAssetIds));

      for (const row of staleRows) {
        quotesResult.push({
          id: row.id,
          assetId: row.assetId,
          price: row.price,
          change24hPct: row.change24hPct,
          change24hAmount: row.change24hAmount,
          dayHigh: row.dayHigh,
          dayLow: row.dayLow,
          volume24h: row.volume24h,
          marketCap: row.marketCap,
          quoteTimestamp: row.quoteTimestamp,
          fetchedAt: row.fetchedAt,
          isStale: true,
          rawMetrics: row.rawPayloadJson ? JSON.parse(row.rawPayloadJson) : null,
        });
      }
    }
  }

  // Load any assets from DB not yet present in freshAssets
  const allNeededAssetIds = cleanedSymbols.map((s) => `B3:${s}`);
  const existingAssetsInDb = await db
    .select()
    .from(marketAssets)
    .where(inArray(marketAssets.id, allNeededAssetIds));

  const assetMap = new Map<string, MarketAsset>();
  for (const a of existingAssetsInDb) {
    assetMap.set(a.id, a as MarketAsset);
  }
  for (const a of freshAssets) {
    assetMap.set(a.id, a);
  }

  return {
    quotes: quotesResult,
    assets: Array.from(assetMap.values()),
    candlesBySymbol,
  };
}

/**
 * Retrieves cryptocurrency dual quotes (USDT primary + BRL conversion) with 2-tier cache.
 */
export async function getCryptoQuotes(
  symbols: string[] = POPULAR_CRYPTO_SYMBOLS.map((p) => p.symbol),
  options?: {
    forceRefresh?: boolean;
    binanceConfig?: BinanceAdapterConfig;
  }
): Promise<{
  quotes: CryptoDualQuote[];
  assets: MarketAsset[];
  usdtBrlRate: number;
}> {
  await ensureDbInitialized();
  const cleaned = symbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
  const now = Date.now();

  // If not force refresh, check memory cache
  if (!options?.forceRefresh) {
    const cachedQuotes: CryptoDualQuote[] = [];
    let allCached = true;

    for (const sym of cleaned) {
      const entry = memoryCryptoQuotesCache.get(`CRYPTO:${sym}`);
      if (entry && entry.expiresAt > now) {
        cachedQuotes.push(entry.data);
      } else {
        allCached = false;
        break;
      }
    }

    if (allCached && memoryUsdtBrlRateCache && memoryUsdtBrlRateCache.expiresAt > now) {
      return {
        quotes: cachedQuotes,
        assets: searchPopularCryptoAssets(),
        usdtBrlRate: memoryUsdtBrlRateCache.rate,
      };
    }
  }

  // Fetch fresh dual quotes from Binance
  try {
    const result = await fetchCryptoDualQuotes(cleaned, options?.binanceConfig);

    // Update memory cache
    memoryUsdtBrlRateCache = {
      rate: result.usdtBrlRate,
      expiresAt: now + MEMORY_CACHE_TTL_MS,
    };

    for (const q of result.quotes) {
      memoryCryptoQuotesCache.set(q.assetId, {
        data: q,
        cachedAt: now,
        expiresAt: now + MEMORY_CACHE_TTL_MS,
      });
    }

    // Persist discovered assets and quotes in DB
    await upsertMarketAssets(result.assets);

    // Save as standard MarketQuote in DB for historical persistence
    const quotesToPersist: MarketQuote[] = result.quotes.map((dq) => ({
      id: dq.assetId,
      assetId: dq.assetId,
      price: dq.priceUsdt,
      change24hPct: dq.change24hPct,
      change24hAmount: dq.change24hAmountUsdt,
      dayHigh: dq.dayHighUsdt,
      dayLow: dq.dayLowUsdt,
      volume24h: dq.volume24hUsdt,
      quoteTimestamp: dq.quoteTimestamp,
      fetchedAt: dq.fetchedAt,
      isStale: false,
      rawMetrics: { priceBrl: dq.priceBrl, usdtBrlRate: dq.usdtBrlRate },
    }));
    await persistQuotesCache(quotesToPersist);

    return result;
  } catch (error) {
    console.warn('[MarketService] Binance crypto fetch failed, falling back to cached DB state:', error);

    const assetIds = cleaned.map((s) => `CRYPTO:${s}`);
    const rows = await db
      .select()
      .from(marketQuotesCache)
      .where(inArray(marketQuotesCache.id, assetIds));

    const fallbackRate = memoryUsdtBrlRateCache?.rate || 5.60;
    const fallbackQuotes: CryptoDualQuote[] = rows.map((r) => {
      const sym = r.id.replace('CRYPTO:', '');
      const baseAsset = sym.endsWith('USDT') ? sym.slice(0, -4) : sym;
      const priceUsdt = r.price;
      const priceBrl = Number((priceUsdt * fallbackRate).toFixed(2));

      return {
        assetId: r.id,
        symbol: sym,
        baseAsset,
        quoteAsset: 'USDT',
        name: baseAsset,
        priceUsdt,
        priceBrl,
        usdtBrlRate: fallbackRate,
        change24hPct: r.change24hPct,
        change24hAmountUsdt: r.change24hAmount,
        change24hAmountBrl: Number((r.change24hAmount * fallbackRate).toFixed(2)),
        dayHighUsdt: r.dayHigh,
        dayLowUsdt: r.dayLow,
        volume24hUsdt: r.volume24h,
        quoteTimestamp: r.quoteTimestamp,
        fetchedAt: r.fetchedAt,
        isStale: true,
      };
    });

    return {
      quotes: fallbackQuotes,
      assets: searchPopularCryptoAssets(),
      usdtBrlRate: fallbackRate,
    };
  }
}

/**
 * Searches B3 assets catalog via brapi.
 */
export async function searchB3(query: string, type?: string): Promise<MarketAsset[]> {
  const brapiType = (type === 'fii' ? 'fund' : type) as 'stock' | 'fund' | 'bdr' | undefined;
  const brapiSubType = type === 'fii' ? 'fii' : undefined;
  return searchBrapiAssets({ search: query, type: brapiType, subType: brapiSubType, limit: 15 });
}

/**
 * Searches supported crypto assets.
 */
export function searchCrypto(query?: string): MarketAsset[] {
  return searchPopularCryptoAssets(query);
}

/**
 * Aggregates a Market Overview summary for top ticker tape and macro comparison.
 */
export async function getMarketOverview(): Promise<MarketOverviewSummary> {
  const indexTickers = ['^BVSP', 'IFIX', 'PETR4', 'VALE3', 'ITUB4', 'BOVA11'];
  const [b3Result, cryptoResult] = await Promise.all([
    getB3Quotes(indexTickers),
    getCryptoQuotes(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']),
  ]);

  const indices = b3Result.quotes.filter((q) => q.assetId.includes('^BVSP') || q.assetId.includes('IFIX'));
  const stocks = b3Result.quotes.filter((q) => !indices.some((i) => i.id === q.id));

  // Sort gainers / losers
  const sorted = [...stocks].sort((a, b) => b.change24hPct - a.change24hPct);
  const topGainersB3 = sorted.filter((s) => s.change24hPct > 0).slice(0, 3);
  const topLosersB3 = [...sorted].reverse().filter((s) => s.change24hPct < 0).slice(0, 3);

  return {
    indices: b3Result.quotes,
    cryptoHighlights: cryptoResult.quotes,
    topGainersB3,
    topLosersB3,
    usdtBrlRate: cryptoResult.usdtBrlRate,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Retrieves the user's Watchlist items enriched with their assets and quotes.
 */
export async function getWatchlist(): Promise<MarketWatchlistItem[]> {
  await ensureDbInitialized();

  const watchlistRows = await db
    .select()
    .from(marketWatchlist)
    .orderBy(desc(marketWatchlist.createdAt));

  if (watchlistRows.length === 0) return [];

  const assetIds = watchlistRows.map((w) => w.assetId);
  const assetRows = await db
    .select()
    .from(marketAssets)
    .where(inArray(marketAssets.id, assetIds));

  const assetMap = new Map<string, MarketAsset>();
  for (const a of assetRows) {
    assetMap.set(a.id, a as MarketAsset);
  }

  // Split into B3 and Crypto symbols for quote enrichment
  const b3Symbols: string[] = [];
  const cryptoSymbols: string[] = [];

  for (const assetId of assetIds) {
    if (assetId.startsWith('B3:')) {
      b3Symbols.push(assetId.replace('B3:', ''));
    } else if (assetId.startsWith('CRYPTO:')) {
      cryptoSymbols.push(assetId.replace('CRYPTO:', ''));
    }
  }

  const [b3QuotesRes, cryptoQuotesRes] = await Promise.all([
    b3Symbols.length > 0 ? getB3Quotes(b3Symbols) : Promise.resolve({ quotes: [] }),
    cryptoSymbols.length > 0 ? getCryptoQuotes(cryptoSymbols) : Promise.resolve({ quotes: [] }),
  ]);

  const b3QuotesMap = new Map<string, MarketQuote>();
  for (const q of b3QuotesRes.quotes) {
    b3QuotesMap.set(q.assetId, q);
  }

  const cryptoQuotesMap = new Map<string, CryptoDualQuote>();
  for (const cq of cryptoQuotesRes.quotes) {
    cryptoQuotesMap.set(cq.assetId, cq);
  }

  return watchlistRows.map((w) => ({
    id: w.id,
    assetId: w.assetId,
    targetPriceAlertHigh: w.targetPriceAlertHigh,
    targetPriceAlertLow: w.targetPriceAlertLow,
    notes: w.notes,
    sortOrder: w.sortOrder,
    createdAt: w.createdAt,
    asset: assetMap.get(w.assetId),
    latestQuote: b3QuotesMap.get(w.assetId) || null,
    cryptoDualQuote: cryptoQuotesMap.get(w.assetId) || null,
  }));
}

/**
 * Adds an asset to the user's Watchlist.
 */
export async function addToWatchlist(input: {
  assetId: string;
  targetPriceAlertHigh?: number | null;
  targetPriceAlertLow?: number | null;
  notes?: string | null;
}): Promise<void> {
  await ensureDbInitialized();

  // Ensure parent asset exists in market_assets to satisfy foreign key constraint
  const [existingAsset] = await db
    .select()
    .from(marketAssets)
    .where(eq(marketAssets.id, input.assetId));

  if (!existingAsset) {
    if (input.assetId.startsWith('CRYPTO:')) {
      const sym = input.assetId.replace('CRYPTO:', '');
      const popular = searchPopularCryptoAssets(sym).find((a) => a.symbol === sym);
      await upsertMarketAssets([
        popular || {
          id: input.assetId,
          symbol: sym,
          name: sym.replace('USDT', ''),
          assetType: 'CRYPTO',
          market: 'CRYPTO',
          currency: 'USDT',
          updatedAt: new Date().toISOString(),
        },
      ]);
    } else if (input.assetId.startsWith('B3:')) {
      const sym = input.assetId.replace('B3:', '');
      await upsertMarketAssets([
        {
          id: input.assetId,
          symbol: sym,
          name: sym,
          assetType: sym.endsWith('11') ? 'FII' : 'STOCK',
          market: 'B3',
          currency: 'BRL',
          updatedAt: new Date().toISOString(),
        },
      ]);
    }
  }

  const id = `watch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  await db.insert(marketWatchlist).values({
    id,
    assetId: input.assetId,
    targetPriceAlertHigh: input.targetPriceAlertHigh || null,
    targetPriceAlertLow: input.targetPriceAlertLow || null,
    notes: input.notes || null,
    sortOrder: 0,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Removes an asset from the Watchlist by its watchlist row ID or assetId.
 */
export async function removeFromWatchlist(idOrAssetId: string): Promise<boolean> {
  await ensureDbInitialized();

  // Try delete by id first, then by assetId
  const res = await db
    .delete(marketWatchlist)
    .where(eq(marketWatchlist.id, idOrAssetId));

  if (res.rowsAffected === 0) {
    const res2 = await db
      .delete(marketWatchlist)
      .where(eq(marketWatchlist.assetId, idOrAssetId));
    return res2.rowsAffected > 0;
  }

  return res.rowsAffected > 0;
}

/**
 * Updates an asset in the user's Watchlist (e.g. price targets or notes).
 */
export async function updateWatchlist(
  id: string,
  input: {
    targetPriceAlertHigh?: number | null;
    targetPriceAlertLow?: number | null;
    notes?: string | null;
  }
): Promise<boolean> {
  await ensureDbInitialized();
  const updateData: Record<string, unknown> = {};
  if (input.targetPriceAlertHigh !== undefined) updateData.targetPriceAlertHigh = input.targetPriceAlertHigh;
  if (input.targetPriceAlertLow !== undefined) updateData.targetPriceAlertLow = input.targetPriceAlertLow;
  if (input.notes !== undefined) updateData.notes = input.notes;

  if (Object.keys(updateData).length === 0) return true;

  const res = await db
    .update(marketWatchlist)
    .set(updateData)
    .where(eq(marketWatchlist.id, id));

  return res.rowsAffected > 0;
}

/**
 * Clear in-memory caches (useful for unit testing).
 */
export function clearMemoryCache(): void {
  memoryQuotesCache.clear();
  memoryCryptoQuotesCache.clear();
  memoryUsdtBrlRateCache = null;
}
