/**
 * FinAI Market Intelligence — Canonical Domain Types
 *
 * Enforces strict typing for:
 * - Brazilian assets (B3): Stocks (ON, PN, Units), FIIs, BDRs, ETFs, Market Indices.
 * - Cryptocurrency pairs: Primary USDT quotes with real-time BRL parity.
 * - Watchlist items, cached quotes and historical candle series.
 */

export type MarketAssetType =
  | 'STOCK'
  | 'FII'
  | 'BDR'
  | 'ETF'
  | 'INDEX'
  | 'CRYPTO';

export type MarketOrigin = 'B3' | 'CRYPTO';

export type MarketCurrency = 'BRL' | 'USDT' | 'USD';

export interface MarketAsset {
  id: string; // e.g. "B3:PETR4" or "CRYPTO:BTCUSDT"
  symbol: string; // "PETR4", "BTCUSDT", "HGLG11"
  name: string;
  assetType: MarketAssetType;
  market: MarketOrigin;
  currency: MarketCurrency;
  logoUrl?: string | null;
  sector?: string | null; // e.g. "Petróleo, Gás e Biocombustíveis", "Logística"
  subType?: string | null; // e.g. "stock", "fii", "bdr", "unit"
  updatedAt: string;
}

export interface MarketQuote {
  id: string; // matches assetId
  assetId: string;
  symbol?: string; // e.g. "PETR4"
  price: number | null;
  change24hPct: number | null;
  change24hAmount: number | null;
  dayHigh?: number | null;
  dayLow?: number | null;
  volume24h?: number | null;
  marketCap?: number | null;
  quoteTimestamp: string | null; // Provider quote time (null if unavailable/unverified)
  fetchedAt: string; // FinAI internal fetch time
  cachedAt?: string | null; // When saved into cache
  isStale?: boolean;
  expectedDelayMinutes?: number | null; // e.g. 15 for B3 delayed feed
  source?: 'network' | 'cache';
  rawMetrics?: {
    dividendYield?: number | null;
    lastDividend?: number | null;
    priceToEarnings?: number | null;
    priceToBook?: number | null;
    fiftyTwoWeekHigh?: number | null;
    fiftyTwoWeekLow?: number | null;
    [key: string]: unknown;
  } | null;
}

export interface CryptoDualQuote {
  assetId: string;
  symbol: string; // e.g. "BTCUSDT"
  baseAsset: string; // "BTC"
  quoteAsset: 'USDT';
  name: string;
  priceUsdt: number | null;
  priceBrl: number | null; // Strictly null if usdtBrlRate is unavailable
  usdtBrlRate: number | null; // Strictly null if unavailable
  change24hPct: number | null;
  change24hAmountUsdt: number | null;
  change24hAmountBrl: number | null;
  dayHighUsdt?: number | null;
  dayLowUsdt?: number | null;
  volume24hUsdt?: number | null;
  quoteTimestamp: string | null; // Provider quote time
  fetchedAt: string; // FinAI internal fetch time
  cachedAt?: string | null;
  isStale?: boolean;
  source?: 'network' | 'cache';
}

export interface HistoricalCandle {
  timestamp: number;
  date: string; // YYYY-MM-DD or ISO
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketWatchlistItem {
  id: string;
  assetId: string;
  targetPriceAlertHigh?: number | null;
  targetPriceAlertLow?: number | null;
  notes?: string | null;
  sortOrder: number;
  createdAt: string;
  asset?: MarketAsset;
  latestQuote?: MarketQuote | null;
  cryptoDualQuote?: CryptoDualQuote | null;
}

export interface MarketSearchFilter {
  query?: string;
  market?: MarketOrigin;
  assetType?: MarketAssetType;
  sector?: string;
  limit?: number;
  page?: number;
}

export interface MarketOverviewSummary {
  indices: MarketQuote[];
  cryptoHighlights: CryptoDualQuote[];
  topGainersB3: MarketQuote[];
  topLosersB3: MarketQuote[];
  usdtBrlRate: number | null; // Null if unavailable
  usdtBrlRateUpdatedAt?: string | null;
  assembledAt: string; // Time when FinAI assembled the overview
  updatedAt: string; // Backward compatibility alias
  source?: 'network' | 'cache' | 'partial';
}
