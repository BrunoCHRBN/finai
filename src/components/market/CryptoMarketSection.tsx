'use client';

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import {
  Coins,
  DollarSign,
  Layers,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Search,
  Star,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import type { MarketAsset, CryptoDualQuote, HistoricalCandle } from '@/lib/market/types';

interface CryptoMarketSectionProps {
  watchlistAssetIds?: Set<string>;
  onToggleWatchlist?: (assetId: string) => Promise<void>;
  onSelectAsset?: (symbol: string) => void;
}

const CRYPTO_CATEGORIES: Record<string, { symbol: string; name: string; tag: string }[]> = {
  ALL: [
    { symbol: 'BTCUSDT', name: 'Bitcoin', tag: 'Store of Value' },
    { symbol: 'ETHUSDT', name: 'Ethereum', tag: 'Smart Contracts L1' },
    { symbol: 'SOLUSDT', name: 'Solana', tag: 'High Perf L1' },
    { symbol: 'BNBUSDT', name: 'BNB', tag: 'Ecosystem L1' },
    { symbol: 'XRPUSDT', name: 'XRP', tag: 'Cross-border' },
    { symbol: 'ADAUSDT', name: 'Cardano', tag: 'PoS L1' },
    { symbol: 'AVAXUSDT', name: 'Avalanche', tag: 'Subnets L1' },
    { symbol: 'LINKUSDT', name: 'Chainlink', tag: 'Oracles & Infra' },
    { symbol: 'DOGEUSDT', name: 'Dogecoin', tag: 'Payment Meme' },
    { symbol: 'NEARUSDT', name: 'NEAR Protocol', tag: 'AI & Sharding' },
    { symbol: 'DOTUSDT', name: 'Polkadot', tag: 'Interoperability' },
    { symbol: 'MATICUSDT', name: 'Polygon', tag: 'Ethereum L2' },
  ],
  L1: [
    { symbol: 'BTCUSDT', name: 'Bitcoin', tag: 'Store of Value' },
    { symbol: 'ETHUSDT', name: 'Ethereum', tag: 'Smart Contracts L1' },
    { symbol: 'SOLUSDT', name: 'Solana', tag: 'High Perf L1' },
    { symbol: 'BNBUSDT', name: 'BNB', tag: 'Ecosystem L1' },
    { symbol: 'ADAUSDT', name: 'Cardano', tag: 'PoS L1' },
    { symbol: 'AVAXUSDT', name: 'Avalanche', tag: 'Subnets L1' },
  ],
  DEFI_INFRA: [
    { symbol: 'LINKUSDT', name: 'Chainlink', tag: 'Oracles & Infra' },
    { symbol: 'DOTUSDT', name: 'Polkadot', tag: 'Interoperability' },
    { symbol: 'NEARUSDT', name: 'NEAR Protocol', tag: 'AI & Sharding' },
    { symbol: 'MATICUSDT', name: 'Polygon', tag: 'Ethereum L2' },
  ],
  MEME_PAYMENT: [
    { symbol: 'DOGEUSDT', name: 'Dogecoin', tag: 'Payment Meme' },
    { symbol: 'XRPUSDT', name: 'XRP', tag: 'Cross-border' },
  ],
};

function formatUSDT(value?: number | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '$ --';
  if (value >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (value >= 1) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(value);
}

function formatBRL(value?: number | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return 'R$ --';
  if (value >= 1000) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatPercent(value?: number | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '0,00%';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2).replace('.', ',')}%`;
}

function formatCompactVolume(val?: number | null): string {
  if (!val) return '--';
  if (val >= 1e9) return `$ ${(val / 1e9).toFixed(2).replace('.', ',')} B`;
  if (val >= 1e6) return `$ ${(val / 1e6).toFixed(2).replace('.', ',')} M`;
  if (val >= 1e3) return `$ ${(val / 1e3).toFixed(1).replace('.', ',')} K`;
  return `$ ${val.toFixed(0)}`;
}

export function CryptoMarketSection({
  watchlistAssetIds = new Set(),
  onToggleWatchlist,
}: CryptoMarketSectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'L1' | 'DEFI_INFRA' | 'MEME_PAYMENT'>('ALL');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [selectedRange, setSelectedRange] = useState<'1d' | '7d' | '30d' | '90d' | '1y'>('30d');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MarketAsset[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [, startTransition] = useTransition();

  const [activeAsset, setActiveAsset] = useState<MarketAsset | null>(null);
  const [activeQuote, setActiveQuote] = useState<CryptoDualQuote | null>(null);
  const [candles, setCandles] = useState<HistoricalCandle[]>([]);
  const [isLoadingQuote, setIsLoadingQuote] = useState(true);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [listQuotes, setListQuotes] = useState<Record<string, CryptoDualQuote>>({});
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [usdtBrlRate, setUsdtBrlRate] = useState<number>(5.65);

  // 1. Fetch detailed quote + historical candles for the selected crypto asset
  const fetchSelectedCryptoDetail = useCallback(async (symbol: string, range: string) => {
    setIsLoadingQuote(true);
    setQuoteError(null);
    try {
      const interval = range === '1d' ? '1h' : range === '7d' ? '4h' : range === '1y' ? '1w' : '1d';
      const limit = range === '1d' ? 24 : range === '7d' ? 42 : range === '30d' ? 30 : 90;

      const res = await fetch(
        `/api/market/crypto/quote?symbol=${encodeURIComponent(symbol)}&candles=true&interval=${interval}&limit=${limit}`
      );
      if (!res.ok) {
        throw new Error(`Falha ao obter cotação de ${symbol} (${res.status})`);
      }
      const data = await res.json();
      const quotes: CryptoDualQuote[] = data.quotes || [];
      const quote = quotes.find((q) => q.symbol === symbol) || quotes[0] || null;
      const assets: MarketAsset[] = data.assets || [];
      const asset = assets.find((a) => a.symbol === symbol) || {
        id: `CRYPTO:${symbol}`,
        symbol,
        name: quote?.name || symbol.replace('USDT', ''),
        assetType: 'CRYPTO' as const,
        market: 'CRYPTO' as const,
        currency: 'USDT' as const,
        updatedAt: new Date().toISOString(),
      };

      setActiveAsset(asset);
      setActiveQuote(quote);
      if (data.usdtBrlRate) {
        setUsdtBrlRate(data.usdtBrlRate);
      }
      if (data.candlesBySymbol && data.candlesBySymbol[symbol]) {
        setCandles(data.candlesBySymbol[symbol]);
      } else {
        setCandles([]);
      }
    } catch (err: unknown) {
      console.error('Error fetching crypto quote:', err);
      const msg = err instanceof Error ? err.message : 'Erro ao carregar dados do ativo.';
      setQuoteError(msg);
    } finally {
      setIsLoadingQuote(false);
    }
  }, []);

  useEffect(() => {
    fetchSelectedCryptoDetail(selectedSymbol, selectedRange);
  }, [selectedSymbol, selectedRange, fetchSelectedCryptoDetail]);

  // 2. Fetch list quotes for curated table view
  const fetchCuratedCryptoList = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const symbolsToFetch = CRYPTO_CATEGORIES[selectedCategory].map((i) => i.symbol).join(',');
      const res = await fetch(`/api/market/crypto/quote?symbols=${symbolsToFetch}`);
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, CryptoDualQuote> = {};
        if (Array.isArray(data.quotes)) {
          for (const q of data.quotes) {
            map[q.symbol] = q;
          }
        }
        setListQuotes(map);
        if (data.usdtBrlRate) {
          setUsdtBrlRate(data.usdtBrlRate);
        }
      }
    } catch (err) {
      console.warn('Error loading crypto list quotes:', err);
    } finally {
      setIsLoadingList(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    fetchCuratedCryptoList();
  }, [fetchCuratedCryptoList]);

  // 3. Search Autocomplete
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/market/crypto/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          startTransition(() => {
            setSearchResults(data.assets || []);
          });
        }
      } catch (err) {
        console.warn('Crypto search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectSearchedAsset = (asset: MarketAsset) => {
    setSelectedSymbol(asset.symbol);
    setSearchQuery('');
    setSearchResults([]);
  };

  const isPositive = (activeQuote?.change24hPct ?? 0) >= 0;
  const isWatchlisted = activeAsset ? watchlistAssetIds.has(activeAsset.id) : false;

  // Chart data formatting
  const chartData = candles.map((candle: HistoricalCandle) => {
    const date = new Date(candle.timestamp);
    let label = '';
    if (selectedRange === '1d') {
      label = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } else if (selectedRange === '7d' || selectedRange === '30d') {
      label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } else {
      label = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    }
    const usdtPrice = candle.close;
    const brlPrice = usdtPrice * (activeQuote?.usdtBrlRate || usdtBrlRate);
    return {
      date: label,
      timestamp: candle.timestamp,
      usdtPrice,
      brlPrice,
    };
  });

  return (
    <div className="space-y-6">
      {/* 1. Header Ribbon: Rate parity + Binance spot indicator */}
      <div className="p-4 bg-white border border-[#E7E1D7] rounded-lg shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#253A32]/10 flex items-center justify-center shrink-0">
            <Coins className="w-5 h-5 text-[#253A32]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif font-semibold text-lg text-[#242823]">
                Mercado de Criptomoedas
              </h2>
              <span className="text-[11px] font-sans font-medium px-2 py-0.5 rounded-full bg-[#253A32]/10 text-[#253A32]">
                Binance Spot
              </span>
            </div>
            <p className="text-[12px] font-sans text-[#777A72]">
              Cotações em tempo real com referência primária em USDT e paridade calculada em BRL.
            </p>
          </div>
        </div>

        {/* Real-time USDT/BRL rate indicator */}
        <div className="flex items-center gap-4 bg-[#F6F3ED] px-4 py-2 rounded-lg border border-[#E7E1D7] self-start md:self-auto">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[#253A32]" />
            <div className="text-left">
              <div className="text-[10px] uppercase font-mono tracking-wider text-[#777A72]">
                Câmbio de Paridade
              </div>
              <div className="text-[13px] font-mono font-semibold text-[#242823]">
                1 USDT = {formatBRL(usdtBrlRate)}
              </div>
            </div>
          </div>
          <div className="h-6 w-px bg-[#E7E1D7]" />
          <div className="flex items-center gap-1.5 text-[11px] text-[#777A72]">
            <Clock className="w-3.5 h-3.5 text-[#777A72]" />
            <span>Tickers contínuos 24/7</span>
          </div>
        </div>
      </div>

      {/* 2. Search Bar & Category Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(
            [
              { id: 'ALL', label: 'Todas Principais', icon: Layers },
              { id: 'L1', label: 'Layer 1 & Bluechips', icon: Sparkles },
              { id: 'DEFI_INFRA', label: 'DeFi & Infra', icon: Coins },
              { id: 'MEME_PAYMENT', label: 'Pagamentos & Memes', icon: TrendingUp },
            ] as const
          ).map((cat) => {
            const Icon = cat.icon;
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-sans transition-colors whitespace-nowrap border ${
                  isActive
                    ? 'bg-[#253A32] text-white border-[#253A32] font-medium shadow-xs'
                    : 'bg-white text-[#5F635C] border-[#E7E1D7] hover:bg-[#F6F3ED] hover:text-[#242823]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Autocomplete */}
        <div className="relative w-full sm:w-80">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[#777A72] absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar par cripto (ex: BTC, SOL, ETH)..."
              className="w-full pl-9 pr-9 py-2 bg-white border border-[#E7E1D7] rounded-lg text-[13px] text-[#242823] placeholder-[#777A72] focus:outline-none focus:border-[#253A32] focus:ring-1 focus:ring-[#253A32] transition-colors"
            />
            {isSearching && (
              <Loader2 className="w-4 h-4 text-[#777A72] animate-spin absolute right-3 pointer-events-none" />
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-[#E7E1D7] rounded-lg shadow-lg z-20 max-h-64 overflow-y-auto divide-y divide-[#E7E1D7]">
              {searchResults.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => handleSelectSearchedAsset(asset)}
                  className="w-full p-2.5 text-left hover:bg-[#F6F3ED] flex items-center justify-between transition-colors text-[13px]"
                >
                  <div>
                    <span className="font-mono font-semibold text-[#242823]">{asset.symbol}</span>
                    <span className="text-[#777A72] ml-2 font-sans">{asset.name}</span>
                  </div>
                  <span className="text-[10px] font-mono uppercase bg-[#253A32]/10 text-[#253A32] px-2 py-0.5 rounded">
                    {asset.currency}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Detailed Interactive Crypto View (Selected Symbol) */}
      <div className="bg-white border border-[#E7E1D7] rounded-xl p-6 shadow-xs space-y-6">
        {isLoadingQuote && !activeQuote ? (
          <div className="h-72 flex flex-col items-center justify-center gap-3 text-[#777A72]">
            <Loader2 className="w-8 h-8 animate-spin text-[#253A32]" />
            <p className="text-[13px] font-sans">Carregando cotação de {selectedSymbol}...</p>
          </div>
        ) : quoteError ? (
          <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-center space-y-2">
            <AlertCircle className="w-6 h-6 text-red-600 mx-auto" />
            <p className="text-[13px] text-red-800 font-medium">{quoteError}</p>
            <button
              onClick={() => fetchSelectedCryptoDetail(selectedSymbol, selectedRange)}
              className="text-[12px] text-red-700 underline font-sans"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            {/* Asset Header & Action bar */}
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-[#E7E1D7] pb-5">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-mono text-2xl font-bold text-[#242823]">
                    {activeAsset?.symbol || selectedSymbol}
                  </h3>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#F6F3ED] text-[#242823] border border-[#E7E1D7] font-semibold">
                    Spot / USDT
                  </span>
                  <span className="text-[11px] font-sans px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Binance Book
                  </span>
                </div>
                <div className="text-[14px] text-[#5F635C] font-sans">
                  {activeAsset?.name || 'Criptoativo'}
                </div>
              </div>

              {/* Dual Price Highlight: USDT (Primary) + BRL (Parity) */}
              <div className="flex flex-wrap items-baseline gap-4 lg:text-right">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#777A72]">
                    Preço Primário (USDT)
                  </div>
                  <div className="font-mono text-3xl font-bold text-[#242823]">
                    {formatUSDT(activeQuote?.priceUsdt)}
                  </div>
                </div>

                {/* BRL Parity Side-by-Side */}
                <div className="bg-[#F6F3ED] px-3.5 py-1.5 rounded-lg border border-[#E7E1D7]">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#777A72]">
                    Paridade em Reais
                  </div>
                  <div className="font-mono text-lg font-semibold text-[#253A32]">
                    ≈ {formatBRL(activeQuote?.priceBrl)}
                  </div>
                </div>

                {/* 24h Variation Pill */}
                <div className="flex flex-col items-start lg:items-end">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#777A72]">
                    Variação 24h
                  </div>
                  <div
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[13px] font-mono font-medium ${
                      isPositive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {isPositive ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    <span>{formatPercent(activeQuote?.change24hPct)}</span>
                  </div>
                </div>

                {/* Watchlist Star Toggle */}
                {onToggleWatchlist && activeAsset && (
                  <button
                    onClick={() => onToggleWatchlist(activeAsset.id)}
                    className={`p-2.5 rounded-lg border transition-colors self-end ${
                      isWatchlisted
                        ? 'bg-amber-50 text-amber-600 border-amber-300 hover:bg-amber-100'
                        : 'bg-white text-[#777A72] border-[#E7E1D7] hover:bg-[#F6F3ED] hover:text-[#242823]'
                    }`}
                    title={isWatchlisted ? 'Remover da lista de acompanhamento' : 'Adicionar à lista'}
                  >
                    <Star className={`w-5 h-5 ${isWatchlisted ? 'fill-amber-400' : ''}`} />
                  </button>
                )}
              </div>
            </div>

            {/* Time range selector for historical chart */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
              <span className="text-[12px] font-sans text-[#777A72]">
                Histórico de Cotações Spot (USDT)
              </span>
              <div className="flex items-center gap-1 bg-[#F6F3ED] p-1 rounded-lg border border-[#E7E1D7]">
                {(
                  [
                    { id: '1d', label: '24h' },
                    { id: '7d', label: '7D' },
                    { id: '30d', label: '30D' },
                    { id: '90d', label: '90D' },
                    { id: '1y', label: '1A' },
                  ] as const
                ).map((range) => (
                  <button
                    key={range.id}
                    onClick={() => setSelectedRange(range.id)}
                    className={`px-2.5 py-1 text-[11px] font-mono rounded transition-colors ${
                      selectedRange === range.id
                        ? 'bg-white text-[#242823] font-semibold shadow-2xs border border-[#E7E1D7]'
                        : 'text-[#777A72] hover:text-[#242823]'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Chart */}
            <div className="h-64 w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cryptoGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor={isPositive ? '#10B981' : '#EF4444'}
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="95%"
                          stopColor={isPositive ? '#10B981' : '#EF4444'}
                          stopOpacity={0.0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      stroke="#A1A49D"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: '#E7E1D7' }}
                    />
                    <YAxis
                      stroke="#A1A49D"
                      fontSize={11}
                      domain={['auto', 'auto']}
                      tickLine={false}
                      axisLine={{ stroke: '#E7E1D7' }}
                      tickFormatter={(val) => `$ ${val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val.toFixed(2)}`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const item = payload[0].payload;
                        return (
                          <div className="bg-white p-3 border border-[#E7E1D7] rounded-lg shadow-md space-y-1">
                            <div className="text-[11px] font-sans text-[#777A72]">
                              {item.date} • {new Date(item.timestamp).toLocaleString('pt-BR')}
                            </div>
                            <div className="font-mono text-[14px] font-bold text-[#242823]">
                              {formatUSDT(item.usdtPrice)} USDT
                            </div>
                            <div className="font-mono text-[12px] text-[#253A32]">
                              ≈ {formatBRL(item.brlPrice)}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="usdtPrice"
                      stroke={isPositive ? '#10B981' : '#EF4444'}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#cryptoGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[#777A72] text-[13px] border border-dashed border-[#E7E1D7] rounded-lg">
                  Histórico não disponível no momento para este intervalo.
                </div>
              )}
            </div>

            {/* 24h Operational Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 bg-[#F6F3ED] rounded-lg border border-[#E7E1D7]">
                <div className="text-[10px] font-mono uppercase text-[#777A72]">Máxima 24h (USDT)</div>
                <div className="font-mono text-[14px] font-semibold text-[#242823]">
                  {formatUSDT(activeQuote?.dayHighUsdt)}
                </div>
                <div className="text-[11px] font-mono text-[#777A72]">
                  ≈ {formatBRL((activeQuote?.dayHighUsdt || 0) * (activeQuote?.usdtBrlRate || usdtBrlRate))}
                </div>
              </div>

              <div className="p-3 bg-[#F6F3ED] rounded-lg border border-[#E7E1D7]">
                <div className="text-[10px] font-mono uppercase text-[#777A72]">Mínima 24h (USDT)</div>
                <div className="font-mono text-[14px] font-semibold text-[#242823]">
                  {formatUSDT(activeQuote?.dayLowUsdt)}
                </div>
                <div className="text-[11px] font-mono text-[#777A72]">
                  ≈ {formatBRL((activeQuote?.dayLowUsdt || 0) * (activeQuote?.usdtBrlRate || usdtBrlRate))}
                </div>
              </div>

              <div className="p-3 bg-[#F6F3ED] rounded-lg border border-[#E7E1D7]">
                <div className="text-[10px] font-mono uppercase text-[#777A72]">Volume 24h (USDT)</div>
                <div className="font-mono text-[14px] font-semibold text-[#242823]">
                  {formatCompactVolume(activeQuote?.volume24hUsdt)}
                </div>
                <div className="text-[11px] font-mono text-[#777A72]">
                  Liquidez global Binance
                </div>
              </div>

              <div className="p-3 bg-[#F6F3ED] rounded-lg border border-[#E7E1D7]">
                <div className="text-[10px] font-mono uppercase text-[#777A72]">Paridade USDT/BRL</div>
                <div className="font-mono text-[14px] font-semibold text-[#242823]">
                  {formatBRL(activeQuote?.usdtBrlRate || usdtBrlRate)}
                </div>
                <div className="text-[11px] font-sans text-[#777A72]">
                  Taxa spot de conversão
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 4. Curated Crypto Table with Dual Quotes */}
      <div className="bg-white border border-[#E7E1D7] rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[#E7E1D7] flex items-center justify-between">
          <div>
            <h4 className="font-serif font-semibold text-[15px] text-[#242823]">
              Principais Criptoativos ({CRYPTO_CATEGORIES[selectedCategory].length})
            </h4>
            <p className="text-[12px] font-sans text-[#777A72]">
              Selecione qualquer linha para carregar o gráfico interativo correspondente.
            </p>
          </div>
          <button
            onClick={fetchCuratedCryptoList}
            disabled={isLoadingList}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-sans text-[#5F635C] hover:text-[#242823] bg-[#F6F3ED] hover:bg-[#EAE5DC] rounded-md transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingList ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#E7E1D7] bg-[#FDFBF7] text-[11px] font-mono uppercase text-[#777A72]">
                <th className="py-3 px-4">Par / Ativo</th>
                <th className="py-3 px-4">Segmento</th>
                <th className="py-3 px-4 text-right">Preço USDT (Primário)</th>
                <th className="py-3 px-4 text-right">Paridade BRL</th>
                <th className="py-3 px-4 text-right">Var. 24h</th>
                <th className="py-3 px-4 text-right">Volume 24h</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E1D7]">
              {CRYPTO_CATEGORIES[selectedCategory].map((item) => {
                const quote = listQuotes[item.symbol];
                const isSelected = selectedSymbol === item.symbol;
                const change = quote?.change24hPct ?? 0;
                const pos = change >= 0;
                const assetId = `CRYPTO:${item.symbol}`;
                const isItemWatchlisted = watchlistAssetIds.has(assetId);

                return (
                  <tr
                    key={item.symbol}
                    onClick={() => setSelectedSymbol(item.symbol)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#253A32]/5 font-medium'
                        : 'hover:bg-[#F6F3ED]/70'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-[#242823]">{item.symbol}</span>
                        <span className="text-[12px] text-[#777A72] font-sans">{item.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] font-sans px-2 py-0.5 rounded bg-[#F6F3ED] text-[#5F635C] border border-[#E7E1D7]">
                        {item.tag}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-[#242823]">
                      {quote ? formatUSDT(quote.priceUsdt) : '--'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[#253A32]">
                      {quote ? `≈ ${formatBRL(quote.priceBrl)}` : '--'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {quote ? (
                        <span
                          className={`inline-flex items-center gap-0.5 font-mono text-[12px] ${
                            pos ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {pos ? '+' : ''}
                          {change.toFixed(2).replace('.', ',')}%
                        </span>
                      ) : (
                        '--'
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[#777A72]">
                      {quote ? formatCompactVolume(quote.volume24hUsdt) : '--'}
                    </td>
                    <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      {onToggleWatchlist && (
                        <button
                          onClick={() => onToggleWatchlist(assetId)}
                          className={`p-1.5 rounded transition-colors ${
                            isItemWatchlisted
                              ? 'text-amber-500 hover:text-amber-600'
                              : 'text-[#A1A49D] hover:text-[#242823]'
                          }`}
                          title={isItemWatchlisted ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                        >
                          <Star className={`w-4 h-4 ${isItemWatchlisted ? 'fill-amber-400' : ''}`} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
