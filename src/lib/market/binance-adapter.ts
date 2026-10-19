/**
 * FinAI Binance Adapter — Cryptocurrency Market Integration
 *
 * Implements:
 * - Public market data queries (zero API key requirement).
 * - Primary quotes in USDT with simultaneous conversion to BRL via real-time USDTBRL rate.
 * - 24-hour rolling statistics, percentage changes and volume.
 * - Historical candlestick (kline) generation.
 * - Resilient fetch with timeout and exponential backoff.
 */

import type {
  MarketAsset,
  CryptoDualQuote,
  HistoricalCandle,
} from './types.ts';

const BINANCE_DEFAULT_BASE_URL = 'https://data-api.binance.vision/api/v3';
const BINANCE_FALLBACK_BASE_URL = 'https://api.binance.com/api/v3';

export const POPULAR_CRYPTO_SYMBOLS = [
  { symbol: 'BTCUSDT', baseAsset: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', name: 'Ethereum' },
  { symbol: 'SOLUSDT', baseAsset: 'SOL', name: 'Solana' },
  { symbol: 'BNBUSDT', baseAsset: 'BNB', name: 'BNB' },
  { symbol: 'XRPUSDT', baseAsset: 'XRP', name: 'XRP' },
  { symbol: 'ADAUSDT', baseAsset: 'ADA', name: 'Cardano' },
  { symbol: 'DOGEUSDT', baseAsset: 'DOGE', name: 'Dogecoin' },
  { symbol: 'AVAXUSDT', baseAsset: 'AVAX', name: 'Avalanche' },
  { symbol: 'DOTUSDT', baseAsset: 'DOT', name: 'Polkadot' },
  { symbol: 'LINKUSDT', baseAsset: 'LINK', name: 'Chainlink' },
  { symbol: 'SUIUSDT', baseAsset: 'SUI', name: 'Sui' },
  { symbol: 'NEARUSDT', baseAsset: 'NEAR', name: 'NEAR Protocol' },
] as const;

export interface BinanceAdapterConfig {
  baseUrl?: string;
  maxRetries?: number;
  backoffBaseMs?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export function getBinanceConfig(overrides?: BinanceAdapterConfig): Required<BinanceAdapterConfig> {
  const envBaseUrl = process.env.BINANCE_API_BASE_URL?.trim().replace(/^["']|["']$/g, '') || BINANCE_DEFAULT_BASE_URL;

  return {
    baseUrl: overrides?.baseUrl ?? envBaseUrl,
    maxRetries: overrides?.maxRetries ?? 3,
    backoffBaseMs: overrides?.backoffBaseMs ?? 400,
    timeoutMs: overrides?.timeoutMs ?? 10000,
    fetchFn: overrides?.fetchFn ?? globalThis.fetch,
  };
}

/**
 * Resilient fetch wrapper for Binance API with retry on 429 and transient 5xx errors.
 */
export async function executeBinanceRequest(
  endpointPath: string,
  config: Required<BinanceAdapterConfig>
): Promise<Response> {
  const url = `${config.baseUrl}${endpointPath}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await config.fetchFn(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'FinAI-Market-Intelligence/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.ok) {
        return response;
      }

      // 429 Rate Limit
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        let waitMs = config.backoffBaseMs * Math.pow(2, attempt) + Math.random() * 150;
        if (retryAfter) {
          const parsed = parseInt(retryAfter, 10);
          if (!isNaN(parsed) && parsed > 0) waitMs = Math.max(waitMs, parsed * 1000);
        }

        if (attempt < config.maxRetries) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }

      // 502 / 503 / 504 Transient Server Errors
      if ([502, 503, 504].includes(response.status)) {
        const waitMs = config.backoffBaseMs * Math.pow(2, attempt) + Math.random() * 150;
        if (attempt < config.maxRetries) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }

      const errText = await response.text().catch(() => '');
      throw new Error(`Binance API error (${response.status}): ${errText || response.statusText}`);
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'));
      lastError = isAbort
        ? new Error(`Binance request timed out after ${config.timeoutMs}ms`)
        : (err as Error);

      if (attempt < config.maxRetries) {
        const waitMs = config.backoffBaseMs * Math.pow(2, attempt) + Math.random() * 150;
        await new Promise((r) => setTimeout(r, waitMs));
      } else {
        break;
      }
    }
  }

  throw lastError || new Error('Binance request failed after max retries');
}

/**
 * Fetches the current USDT to BRL conversion rate from Binance Spot (symbol: USDTBRL).
 */
export async function fetchUsdtBrlRate(customConfig?: BinanceAdapterConfig): Promise<number> {
  const config = getBinanceConfig(customConfig);
  try {
    const res = await executeBinanceRequest('/ticker/price?symbol=USDTBRL', config);
    const data = await res.json();
    const rate = Number(data?.price);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Invalid USDTBRL price received: ${data?.price}`);
    }
    return rate;
  } catch (error) {
    // If primary endpoint failed and we used vision, attempt fallback domain once
    if (config.baseUrl.includes('binance.vision')) {
      const fallbackConfig = { ...config, baseUrl: BINANCE_FALLBACK_BASE_URL };
      const res = await executeBinanceRequest('/ticker/price?symbol=USDTBRL', fallbackConfig);
      const data = await res.json();
      const rate = Number(data?.price);
      if (Number.isFinite(rate) && rate > 0) return rate;
    }
    throw error;
  }
}

/**
 * Fetches 24hr ticker statistics for a list of symbols in USDT.
 */
export async function fetchBinance24hTickers(
  symbols: string[],
  customConfig?: BinanceAdapterConfig
): Promise<Record<string, unknown>[]> {
  const config = getBinanceConfig(customConfig);
  if (!symbols || symbols.length === 0) return [];

  // If single symbol, query with ?symbol=...
  if (symbols.length === 1) {
    const sym = symbols[0].toUpperCase();
    const res = await executeBinanceRequest(`/ticker/24hr?symbol=${encodeURIComponent(sym)}`, config);
    const data = await res.json();
    if (!data) return [];
    return Array.isArray(data) ? data : [data];
  }

  // If multiple symbols, query with ?symbols=["BTCUSDT","ETHUSDT",...]
  const formattedSymbols = JSON.stringify(symbols.map((s) => s.toUpperCase()));
  const res = await executeBinanceRequest(`/ticker/24hr?symbols=${encodeURIComponent(formattedSymbols)}`, config);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export interface CryptoDualQuotesResult {
  quotes: CryptoDualQuote[];
  assets: MarketAsset[];
  usdtBrlRate: number;
}

/**
 * High-level method: Fetches dual quotes (USDT primary + BRL converted) for requested crypto symbols.
 */
export async function fetchCryptoDualQuotes(
  symbols: string[] = POPULAR_CRYPTO_SYMBOLS.map((p) => p.symbol),
  customConfig?: BinanceAdapterConfig
): Promise<CryptoDualQuotesResult> {
  const config = getBinanceConfig(customConfig);

  // 1. Fetch USDTBRL rate and 24h tickers concurrently
  const [usdtBrlRate, rawTickers] = await Promise.all([
    fetchUsdtBrlRate(config),
    fetchBinance24hTickers(symbols, config),
  ]);

  const fetchedAt = new Date().toISOString();
  const nameMap = new Map<string, string>(POPULAR_CRYPTO_SYMBOLS.map((p) => [p.symbol, p.name]));

  const quotes: CryptoDualQuote[] = [];
  const assets: MarketAsset[] = [];

  for (const ticker of rawTickers) {
    if (!ticker || !ticker.symbol) continue;

    const sym = String(ticker.symbol).toUpperCase();
    const baseAsset = sym.endsWith('USDT') ? sym.slice(0, -4) : sym;
    const name = nameMap.get(sym) || `${baseAsset} Token`;

    const priceUsdt = Number(ticker.lastPrice) || 0;
    const priceBrl = Number((priceUsdt * usdtBrlRate).toFixed(2));
    const changePct = Number(ticker.priceChangePercent) || 0;
    const changeAmountUsdt = Number(ticker.priceChange) || 0;
    const changeAmountBrl = Number((changeAmountUsdt * usdtBrlRate).toFixed(2));

    const dayHighUsdt = ticker.highPrice ? Number(ticker.highPrice) : null;
    const dayLowUsdt = ticker.lowPrice ? Number(ticker.lowPrice) : null;
    const volume24hUsdt = ticker.quoteVolume ? Number(ticker.quoteVolume) : null;

    let quoteTimestamp = fetchedAt;
    if (ticker.closeTime) {
      quoteTimestamp = new Date(Number(ticker.closeTime)).toISOString();
    }

    const dualQuote: CryptoDualQuote = {
      assetId: `CRYPTO:${sym}`,
      symbol: sym,
      baseAsset,
      quoteAsset: 'USDT',
      name,
      priceUsdt,
      priceBrl,
      usdtBrlRate,
      change24hPct: changePct,
      change24hAmountUsdt: changeAmountUsdt,
      change24hAmountBrl: changeAmountBrl,
      dayHighUsdt,
      dayLowUsdt,
      volume24hUsdt,
      quoteTimestamp,
      fetchedAt,
      isStale: false,
    };

    const asset: MarketAsset = {
      id: `CRYPTO:${sym}`,
      symbol: sym,
      name,
      assetType: 'CRYPTO',
      market: 'CRYPTO',
      currency: 'USDT',
      logoUrl: null,
      sector: 'Criptoativos',
      subType: 'spot',
      updatedAt: fetchedAt,
    };

    quotes.push(dualQuote);
    assets.push(asset);
  }

  return { quotes, assets, usdtBrlRate };
}

/**
 * Fetches historical OHLCV candlestick data from Binance Spot.
 */
export async function fetchBinanceKlines(
  symbol: string,
  interval = '1d',
  limit = 30,
  customConfig?: BinanceAdapterConfig
): Promise<HistoricalCandle[]> {
  const config = getBinanceConfig(customConfig);
  const sym = symbol.toUpperCase().trim();
  const endpoint = `/klines?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;

  const res = await executeBinanceRequest(endpoint, config);
  const data = await res.json();

  if (!Array.isArray(data)) return [];

  return data.map((k: (number | string)[]) => {
    const openTime = Number(k[0]);
    return {
      timestamp: openTime,
      date: new Date(openTime).toISOString().split('T')[0],
      open: Number(k[1]) || 0,
      high: Number(k[2]) || 0,
      low: Number(k[3]) || 0,
      close: Number(k[4]) || 0,
      volume: Number(k[5]) || 0,
    };
  });
}

/**
 * Search and filter supported crypto assets against the popular list.
 */
export function searchPopularCryptoAssets(query?: string): MarketAsset[] {
  const now = new Date().toISOString();
  const q = (query || '').toUpperCase().trim();

  const filtered = !q
    ? POPULAR_CRYPTO_SYMBOLS
    : POPULAR_CRYPTO_SYMBOLS.filter(
        (p) => p.symbol.includes(q) || p.baseAsset.includes(q) || p.name.toUpperCase().includes(q)
      );

  return filtered.map((p) => ({
    id: `CRYPTO:${p.symbol}`,
    symbol: p.symbol,
    name: p.name,
    assetType: 'CRYPTO',
    market: 'CRYPTO',
    currency: 'USDT',
    sector: 'Criptoativos',
    subType: 'spot',
    updatedAt: now,
  }));
}
