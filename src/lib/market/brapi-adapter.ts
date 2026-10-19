/**
 * FinAI brapi.dev Adapter — Brazilian Market (B3) Integration
 *
 * Implements:
 * - Strict serialized execution (Concurrency Mutex = 1) to honor the free tier constraint.
 * - Resilient fetch with exponential backoff on 429 (Rate Limit) and transient 5xx errors.
 * - Support for Stocks (ON, PN, Units), FIIs, BDRs, ETFs, and Market Indices.
 * - Secure backend-only credentials: reads BRAPI_API_TOKEN without leaking to frontend.
 * - Sandbox ticker fallback (PETR4, VALE3, MGLU3, ITUB4).
 */

import type {
  MarketAsset,
  MarketQuote,
  HistoricalCandle,
  MarketAssetType,
} from './types.ts';

const BRAPI_DEFAULT_BASE_URL = 'https://brapi.dev/api';
const SANDBOX_TICKERS = new Set(['PETR4', 'VALE3', 'MGLU3', 'ITUB4']);

/**
 * Concurrency Mutex to enforce max 1 concurrent request for brapi free tier.
 */
export class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.locked = true;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.locked = false;
    }
  }

  get isLocked(): boolean {
    return this.locked;
  }

  get queueLength(): number {
    return this.queue.length;
  }
}

export const brapiMutex = new AsyncMutex();

export interface BrapiAdapterConfig {
  apiToken?: string;
  baseUrl?: string;
  maxRetries?: number;
  backoffBaseMs?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export function getBrapiConfig(overrides?: BrapiAdapterConfig): Required<BrapiAdapterConfig> {
  const envToken = process.env.BRAPI_API_TOKEN?.trim().replace(/^["']|["']$/g, '') || '';
  const envBaseUrl = process.env.BRAPI_BASE_URL?.trim().replace(/^["']|["']$/g, '') || BRAPI_DEFAULT_BASE_URL;

  return {
    apiToken: overrides?.apiToken ?? envToken,
    baseUrl: overrides?.baseUrl ?? envBaseUrl,
    maxRetries: overrides?.maxRetries ?? 3,
    backoffBaseMs: overrides?.backoffBaseMs ?? 500,
    timeoutMs: overrides?.timeoutMs ?? 12000,
    fetchFn: overrides?.fetchFn ?? globalThis.fetch,
  };
}

/**
 * Executes an HTTP request through the brapi serialized mutex with retry and timeout.
 */
export async function executeBrapiRequest(
  url: string,
  config: Required<BrapiAdapterConfig>
): Promise<Response> {
  const release = await brapiMutex.acquire();

  try {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);

      try {
        const headers: Record<string, string> = {
          'Accept': 'application/json',
          'User-Agent': 'FinAI-Market-Intelligence/1.0',
        };

        if (config.apiToken) {
          headers['Authorization'] = `Bearer ${config.apiToken}`;
        }

        const response = await config.fetchFn(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (response.ok) {
          return response;
        }

        // 429 Rate Limit / Concurrency Exceeded
        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('Retry-After');
          let waitMs = config.backoffBaseMs * Math.pow(2, attempt) + Math.random() * 200;
          if (retryAfterHeader) {
            const parsed = parseInt(retryAfterHeader, 10);
            if (!isNaN(parsed) && parsed > 0) {
              waitMs = Math.max(waitMs, parsed * 1000);
            }
          }

          if (attempt < config.maxRetries) {
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
        }

        // 502 / 503 / 504 Transient Server Errors
        if ([502, 503, 504].includes(response.status)) {
          const waitMs = config.backoffBaseMs * Math.pow(2, attempt) + Math.random() * 200;
          if (attempt < config.maxRetries) {
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
        }

        const errorText = await response.text().catch(() => '');
        throw new Error(`brapi API error (${response.status}): ${errorText || response.statusText}`);
      } catch (err: unknown) {
        clearTimeout(timer);
        const isAbort = err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'));
        lastError = isAbort
          ? new Error(`brapi request timed out after ${config.timeoutMs}ms`)
          : (err as Error);

        if (attempt < config.maxRetries) {
          const waitMs = config.backoffBaseMs * Math.pow(2, attempt) + Math.random() * 200;
          await new Promise((r) => setTimeout(r, waitMs));
        } else {
          break;
        }
      }
    }

    throw lastError || new Error('brapi request failed after max retries');
  } finally {
    // Artificial small delay between serialized calls to respect API pacing
    await new Promise((r) => setTimeout(r, 60));
    release();
  }
}

/**
 * Infer asset type based on ticker format and brapi metadata
 */
export function inferBrapiAssetType(symbol: string, rawType?: string, subType?: string): MarketAssetType {
  const upper = symbol.toUpperCase().trim();
  const rawLower = (rawType || '').toLowerCase();
  const subLower = (subType || '').toLowerCase();

  if (upper.startsWith('^') || upper === 'IFIX' || upper === 'IBOV' || upper === 'SMLL') {
    return 'INDEX';
  }
  if (subLower === 'fii' || rawLower === 'fund' || /^[A-Z]{4}11$/.test(upper)) {
    // If it ends in 11, could be FII, Unit or ETF. Check hint or default to FII for popular B3 FIIs
    if (subLower === 'etf' || ['BOVA11', 'SMAL11', 'IVVB11', 'HASH11', 'XINA11'].includes(upper)) {
      return 'ETF';
    }
    if (subLower === 'unit' || ['TAEE11', 'SANB11', 'KLBN11', 'BPAC11', 'ALUP11', 'SAPR11'].includes(upper)) {
      return 'STOCK';
    }
    return 'FII';
  }
  if (subLower === 'bdr' || rawLower === 'bdr' || /^[A-Z]{4}(32|33|34|35)$/.test(upper)) {
    return 'BDR';
  }
  if (subLower === 'etf' || rawLower === 'etf') {
    return 'ETF';
  }
  return 'STOCK';
}

export interface FetchBrapiQuotesOptions {
  range?: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'ytd' | 'max';
  interval?: '1m' | '5m' | '15m' | '30m' | '1h' | '1d' | '1wk' | '1mo';
  fundamental?: boolean;
}

export interface BrapiQuotesResult {
  quotes: MarketQuote[];
  assets: MarketAsset[];
  historicalCandlesBySymbol: Record<string, HistoricalCandle[]>;
}

export interface BrapiRawQuoteItem {
  symbol?: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  marketCap?: number;
  regularMarketTime?: string | number;
  logourl?: string;
  dividendYield?: number;
  lastDividend?: number;
  priceEarnings?: number;
  priceToBook?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  type?: string;
  subType?: string;
  sector?: string;
  summaryProfile?: {
    sector?: string;
    dividendYield?: number;
    [key: string]: unknown;
  };
  historicalDataPrice?: Array<{
    date?: number;
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
  }>;
}

/**
 * Fetches quotes and assets for one or multiple B3 tickers in batch.
 */
export async function fetchBrapiQuotes(
  symbols: string[],
  options: FetchBrapiQuotesOptions = {},
  customConfig?: BrapiAdapterConfig
): Promise<BrapiQuotesResult> {
  if (!symbols || symbols.length === 0) {
    return { quotes: [], assets: [], historicalCandlesBySymbol: {} };
  }

  const config = getBrapiConfig(customConfig);
  const cleanedSymbols = symbols.map((s) => s.trim().toUpperCase()).filter(Boolean);

  // Brapi Free Tier restricts requests to strictly 1 quote per HTTP call.
  // When multiple tickers are requested, we execute them sequentially via brapiMutex.
  if (cleanedSymbols.length > 1) {
    const quotes: MarketQuote[] = [];
    const assets: MarketAsset[] = [];
    const historicalCandlesBySymbol: Record<string, HistoricalCandle[]> = {};

    for (const sym of cleanedSymbols) {
      try {
        const singleResult = await fetchBrapiQuotes([sym], options, customConfig);
        quotes.push(...singleResult.quotes);
        assets.push(...singleResult.assets);
        Object.assign(historicalCandlesBySymbol, singleResult.historicalCandlesBySymbol);
      } catch (err) {
        console.warn(`[brapi] Failed quote fetch for ${sym}:`, err);
      }
    }

    return { quotes, assets, historicalCandlesBySymbol };
  }

  const symbolList = cleanedSymbols[0];

  const queryParams = new URLSearchParams();
  if (options.range) queryParams.set('range', options.range);
  if (options.interval) queryParams.set('interval', options.interval);
  if (options.fundamental) queryParams.set('fundamental', 'true');

  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const url = `${config.baseUrl}/quote/${encodeURIComponent(symbolList)}${queryString}`;

  const response = await executeBrapiRequest(url, config);
  const data = (await response.json()) as { results?: BrapiRawQuoteItem[] };

  const results: BrapiRawQuoteItem[] = Array.isArray(data?.results) ? data.results : [];
  const fetchedAt = new Date().toISOString();

  const quotes: MarketQuote[] = [];
  const assets: MarketAsset[] = [];
  const historicalCandlesBySymbol: Record<string, HistoricalCandle[]> = {};

  for (const item of results) {
    if (!item || !item.symbol) continue;

    const sym = String(item.symbol).toUpperCase();
    const assetId = `B3:${sym}`;
    const assetType = inferBrapiAssetType(sym, item.type, item.subType);
    const price = typeof item.regularMarketPrice === 'number' ? item.regularMarketPrice : 0;
    const changePct = typeof item.regularMarketChangePercent === 'number' ? item.regularMarketChangePercent : 0;
    const changeAmount = typeof item.regularMarketChange === 'number' ? item.regularMarketChange : 0;
    const dayHigh = typeof item.regularMarketDayHigh === 'number' ? item.regularMarketDayHigh : null;
    const dayLow = typeof item.regularMarketDayLow === 'number' ? item.regularMarketDayLow : null;
    const volume = typeof item.regularMarketVolume === 'number' ? item.regularMarketVolume : null;
    const marketCap = typeof item.marketCap === 'number' ? item.marketCap : null;

    let quoteTimestamp = fetchedAt;
    if (item.regularMarketTime) {
      quoteTimestamp = new Date(item.regularMarketTime).toISOString();
    }

    // Historical candles if returned
    const candles: HistoricalCandle[] = [];
    if (Array.isArray(item.historicalDataPrice)) {
      for (const h of item.historicalDataPrice) {
        if (!h) continue;
        const ts = typeof h.date === 'number' ? (h.date > 1e11 ? h.date : h.date * 1000) : Date.now();
        candles.push({
          timestamp: ts,
          date: new Date(ts).toISOString().split('T')[0],
          open: Number(h.open) || 0,
          high: Number(h.high) || 0,
          low: Number(h.low) || 0,
          close: Number(h.close) || 0,
          volume: Number(h.volume) || 0,
        });
      }
    }
    historicalCandlesBySymbol[sym] = candles;

    const rawMetrics: MarketQuote['rawMetrics'] = {
      dividendYield: item.dividendYield ?? item.summaryProfile?.dividendYield ?? null,
      lastDividend: item.lastDividend ?? null,
      priceToEarnings: item.priceEarnings ?? null,
      priceToBook: item.priceToBook ?? null,
      fiftyTwoWeekHigh: item.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: item.fiftyTwoWeekLow ?? null,
    };

    const quote: MarketQuote = {
      id: assetId,
      assetId,
      price,
      change24hPct: changePct,
      change24hAmount: changeAmount,
      dayHigh,
      dayLow,
      volume24h: volume,
      marketCap,
      quoteTimestamp,
      fetchedAt,
      isStale: false,
      rawMetrics,
    };

    const asset: MarketAsset = {
      id: assetId,
      symbol: sym,
      name: item.longName || item.shortName || sym,
      assetType,
      market: 'B3',
      currency: 'BRL',
      logoUrl: item.logourl || null,
      sector: item.summaryProfile?.sector || item.sector || null,
      subType: item.subType || null,
      updatedAt: fetchedAt,
    };

    quotes.push(quote);
    assets.push(asset);
  }

  return { quotes, assets, historicalCandlesBySymbol };
}

export interface BrapiSearchParams {
  search?: string;
  type?: 'stock' | 'fund' | 'bdr';
  subType?: 'stock' | 'fii' | 'etf' | 'bdr' | 'unit';
  limit?: number;
  page?: number;
  sortBy?: 'volume' | 'name' | 'close' | 'change';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Searches and lists assets available on B3 through brapi /api/quote/list.
 */
export async function searchBrapiAssets(
  params: BrapiSearchParams = {},
  customConfig?: BrapiAdapterConfig
): Promise<MarketAsset[]> {
  const config = getBrapiConfig(customConfig);
  const query = new URLSearchParams();

  if (params.search) query.set('search', params.search);
  if (params.type) query.set('type', params.type);
  if (params.subType) query.set('subType', params.subType);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.page) query.set('page', String(params.page));
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.sortOrder) query.set('sortOrder', params.sortOrder);

  const url = `${config.baseUrl}/quote/list?${query.toString()}`;
  const response = await executeBrapiRequest(url, config);
  const data = await response.json();

  const now = new Date().toISOString();
  const assets: MarketAsset[] = [];

  // Add stock/fund/bdr items
  if (Array.isArray(data.stocks)) {
    for (const item of data.stocks) {
      if (!item || !item.stock) continue;
      const sym = String(item.stock).toUpperCase();
      assets.push({
        id: `B3:${sym}`,
        symbol: sym,
        name: item.name || sym,
        assetType: inferBrapiAssetType(sym, item.type, item.subType),
        market: 'B3',
        currency: 'BRL',
        logoUrl: item.logo || null,
        sector: item.sector || null,
        subType: item.subType || item.type || null,
        updatedAt: now,
      });
    }
  }

  // Add indexes if present
  if (Array.isArray(data.indexes)) {
    for (const item of data.indexes) {
      if (!item || !item.stock) continue;
      const sym = String(item.stock).toUpperCase();
      assets.push({
        id: `B3:${sym}`,
        symbol: sym,
        name: item.name || sym,
        assetType: 'INDEX',
        market: 'B3',
        currency: 'BRL',
        logoUrl: null,
        sector: 'Índice de Mercado',
        subType: 'index',
        updatedAt: now,
      });
    }
  }

  return assets;
}

export { SANDBOX_TICKERS };
