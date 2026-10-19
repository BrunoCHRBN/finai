'use client';

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Search,
  Star,
  RefreshCw,
  Building,
  Layers,
  Globe,
  Coins,
  AlertCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import type { MarketAsset, MarketQuote, HistoricalCandle, MarketAssetType } from '@/lib/market/types';

interface StockMarketSectionProps {
  watchlistAssetIds?: Set<string>;
  onToggleWatchlist?: (assetId: string) => Promise<void>;
}

const CURATED_LISTS: Record<string, { symbol: string; name: string; type: MarketAssetType }[]> = {
  ALL: [
    { symbol: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    { symbol: 'VALE3', name: 'Vale ON', type: 'STOCK' },
    { symbol: 'ITUB4', name: 'Itaú Unibanco PN', type: 'STOCK' },
    { symbol: 'HGLG11', name: 'CSHG Logística FII', type: 'FII' },
    { symbol: 'MXRF11', name: 'Maxi Renda FII', type: 'FII' },
    { symbol: 'NVDC34', name: 'Nvidia BDR', type: 'BDR' },
    { symbol: 'AAPL34', name: 'Apple BDR', type: 'BDR' },
    { symbol: 'BOVA11', name: 'iShares Ibovespa ETF', type: 'ETF' },
    { symbol: 'IVVB11', name: 'S&P 500 ETF B3', type: 'ETF' },
  ],
  STOCK: [
    { symbol: 'PETR4', name: 'Petrobras PN', type: 'STOCK' },
    { symbol: 'VALE3', name: 'Vale ON', type: 'STOCK' },
    { symbol: 'ITUB4', name: 'Itaú Unibanco PN', type: 'STOCK' },
    { symbol: 'WEGE3', name: 'WEG ON', type: 'STOCK' },
    { symbol: 'BBAS3', name: 'Banco do Brasil ON', type: 'STOCK' },
    { symbol: 'RENT3', name: 'Localiza ON', type: 'STOCK' },
  ],
  FII: [
    { symbol: 'HGLG11', name: 'CSHG Logística', type: 'FII' },
    { symbol: 'MXRF11', name: 'Maxi Renda', type: 'FII' },
    { symbol: 'XPML11', name: 'XP Malls', type: 'FII' },
    { symbol: 'KNIP11', name: 'Kinea Rendimentos', type: 'FII' },
    { symbol: 'BTLG11', name: 'BTG Logística', type: 'FII' },
  ],
  BDR: [
    { symbol: 'NVDC34', name: 'Nvidia Corporation', type: 'BDR' },
    { symbol: 'AAPL34', name: 'Apple Inc.', type: 'BDR' },
    { symbol: 'MSFT34', name: 'Microsoft Corporation', type: 'BDR' },
    { symbol: 'AMZO34', name: 'Amazon.com Inc.', type: 'BDR' },
    { symbol: 'GOGL34', name: 'Alphabet Inc. (Google)', type: 'BDR' },
  ],
  ETF: [
    { symbol: 'BOVA11', name: 'iShares Ibovespa', type: 'ETF' },
    { symbol: 'SMAL11', name: 'iShares Small Cap', type: 'ETF' },
    { symbol: 'IVVB11', name: 'iShares S&P 500 BRL', type: 'ETF' },
    { symbol: 'HASH11', name: 'Hashdex Nasdaq Crypto', type: 'ETF' },
  ],
};

function formatBRL(value?: number | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return 'R$ --';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatPercent(value?: number | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '0,00%';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2).replace('.', ',')}%`;
}

function formatVolume(val?: number | null): string {
  if (!val) return '--';
  if (val >= 1e9) return `R$ ${(val / 1e9).toFixed(2).replace('.', ',')} B`;
  if (val >= 1e6) return `R$ ${(val / 1e6).toFixed(2).replace('.', ',')} M`;
  if (val >= 1e3) return `R$ ${(val / 1e3).toFixed(1).replace('.', ',')} K`;
  return `R$ ${val.toFixed(0)}`;
}

export function StockMarketSection({
  watchlistAssetIds = new Set(),
  onToggleWatchlist,
}: StockMarketSectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'STOCK' | 'FII' | 'BDR' | 'ETF'>('ALL');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('PETR4');
  const [selectedRange, setSelectedRange] = useState<'5d' | '1mo' | '6mo' | '1y'>('1mo');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MarketAsset[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [, startTransition] = useTransition();

  const [activeAsset, setActiveAsset] = useState<MarketAsset | null>(null);
  const [activeQuote, setActiveQuote] = useState<MarketQuote | null>(null);
  const [candles, setCandles] = useState<HistoricalCandle[]>([]);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  const [popularQuotes, setPopularQuotes] = useState<Record<string, MarketQuote>>({});
  const [indices, setIndices] = useState<MarketQuote[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 1. Fetch indices and popular quotes on mount
  const loadMarketData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // 1a. Load Overview for index ribbon
      const overviewRes = await fetch('/api/market/overview');
      if (overviewRes.ok) {
        const data = await overviewRes.json();
        if (Array.isArray(data.indices)) {
          setIndices(data.indices);
        }
      }

      // 1b. Load quotes for the current curated category list
      const targetSymbols = CURATED_LISTS[selectedCategory].map((i) => i.symbol).join(',');
      const quotesRes = await fetch(`/api/market/stocks/quote?symbols=${targetSymbols}`);
      if (quotesRes.ok) {
        const data = await quotesRes.json();
        const map: Record<string, MarketQuote> = {};
        for (const q of data.quotes || []) {
          const sym = q.assetId.replace('B3:', '');
          map[sym] = q;
        }
        setPopularQuotes(map);
      }
    } catch (err) {
      console.warn('Failed to load market overview:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    loadMarketData();
  }, [loadMarketData]);

  // 2. Fetch selected asset detail & candles
  const loadAssetDetails = useCallback(async (sym: string, range: string, refresh = false) => {
    setIsLoadingQuote(true);
    try {
      const res = await fetch(`/api/market/stocks/quote?symbols=${sym}&range=${range}&interval=1d${refresh ? '&refresh=true' : ''}`);
      if (res.ok) {
        const data = await res.json();
        if (data.quotes && data.quotes.length > 0) {
          setActiveQuote(data.quotes[0]);
        }
        if (data.assets && data.assets.length > 0) {
          setActiveAsset(data.assets[0]);
        }
        if (data.candlesBySymbol && data.candlesBySymbol[sym]) {
          setCandles(data.candlesBySymbol[sym]);
        }
      }
    } catch (err) {
      console.warn(`Failed to load details for ${sym}:`, err);
    } finally {
      setIsLoadingQuote(false);
    }
  }, []);

  useEffect(() => {
    loadAssetDetails(selectedSymbol, selectedRange);
  }, [selectedSymbol, selectedRange, loadAssetDetails]);

  // 3. Search B3 assets with debounce
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const typeParam = selectedCategory !== 'ALL' ? `&type=${selectedCategory.toLowerCase()}` : '';
        const res = await fetch(`/api/market/stocks/search?q=${encodeURIComponent(searchQuery)}${typeParam}`);
        if (res.ok) {
          const data = await res.json();
          startTransition(() => {
            setSearchResults(data.assets || []);
          });
        }
      } catch (err) {
        console.warn('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory]);

  const isPositive = (activeQuote?.change24hPct ?? 0) >= 0;
  const isWatchlisted = activeAsset ? watchlistAssetIds.has(activeAsset.id) : false;

  const handleSelectAsset = (sym: string) => {
    setSelectedSymbol(sym);
    setSearchQuery('');
    setSearchResults([]);
  };

  const getCategoryBadge = (type?: MarketAssetType) => {
    switch (type) {
      case 'FII':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#EDE9FE] text-[#6D28D9]">FII</span>;
      case 'BDR':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#E0F2FE] text-[#0369A1]">BDR</span>;
      case 'ETF':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#FEF3C7] text-[#B45309]">ETF</span>;
      case 'INDEX':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#F3F4F6] text-[#374151]">ÍNDICE</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#DCFCE7] text-[#15803D]">AÇÃO</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Top Market Indices Ribbon */}
      <div className="bg-[#FFFFFF] border border-[#E7E1D7] p-3.5 shadow-xs">
        <div className="flex items-center justify-between gap-4 overflow-x-auto pb-1 text-xs">
          <div className="flex items-center gap-6 divide-x divide-[#E7E1D7]">
            <div className="flex items-center gap-2 pl-1">
              <span className="font-semibold text-[#242823] tracking-wider uppercase text-[11px]">Mercado B3</span>
              <span className="inline-block w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            </div>

            {indices.map((idx) => {
              const sym = idx.assetId.replace('B3:', '');
              const pos = idx.change24hPct >= 0;
              return (
                <div key={idx.id} className="pl-4 flex items-center gap-2 whitespace-nowrap">
                  <span className="font-semibold text-[#242823]">{sym === '^BVSP' ? 'IBOVESPA' : sym}</span>
                  <span className="font-mono text-[#5F635C]">{sym === '^BVSP' ? idx.price.toLocaleString('pt-BR') : formatBRL(idx.price)}</span>
                  <span
                    className={`inline-flex items-center font-mono font-medium text-[11px] ${
                      pos ? 'text-[#15803D]' : 'text-[#B91C1C]'
                    }`}
                  >
                    {pos ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
                    {formatPercent(idx.change24hPct)}
                  </span>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => loadMarketData()}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-[#5F635C] hover:text-[#242823] transition-colors border border-[#E7E1D7] bg-[#F6F3ED] hover:bg-[#FFFFFF] shrink-0"
            title="Atualizar cotações agora"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* 2. Search & Segment Filters */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search Bar with Autocomplete Dropdown */}
        <div className="relative flex-1 max-w-lg">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[#777A72] absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar por ticker ou nome (ex: PETR4, HGLG11, NVDC34, BOVA11)..."
              className="w-full bg-[#FFFFFF] border border-[#E7E1D7] pl-10 pr-9 py-2.5 text-xs text-[#242823] placeholder-[#777A72] focus:outline-hidden focus:border-[#253A32] shadow-2xs font-sans"
            />
            {isSearching && (
              <Loader2 className="w-4 h-4 animate-spin text-[#777A72] absolute right-3" />
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[#FFFFFF] border border-[#E7E1D7] shadow-lg z-50 max-h-72 overflow-y-auto divide-y divide-[#E7E1D7]">
              {searchResults.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => handleSelectAsset(asset.symbol)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-[#F6F3ED] transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-xs text-[#242823] font-mono group-hover:text-[#253A32]">
                      {asset.symbol}
                    </span>
                    <span className="text-xs text-[#5F635C] truncate max-w-[240px]">{asset.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getCategoryBadge(asset.assetType)}
                    <span className="text-[10px] text-[#777A72] font-mono">{asset.sector || 'Geral'}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1 bg-[#FFFFFF] p-1 border border-[#E7E1D7] text-xs">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedCategory === 'ALL'
                ? 'bg-[#253A32] text-[#FFFFFF]'
                : 'text-[#5F635C] hover:text-[#242823]'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setSelectedCategory('STOCK')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
              selectedCategory === 'STOCK'
                ? 'bg-[#253A32] text-[#FFFFFF]'
                : 'text-[#5F635C] hover:text-[#242823]'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            Ações
          </button>
          <button
            onClick={() => setSelectedCategory('FII')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
              selectedCategory === 'FII'
                ? 'bg-[#253A32] text-[#FFFFFF]'
                : 'text-[#5F635C] hover:text-[#242823]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            FIIs
          </button>
          <button
            onClick={() => setSelectedCategory('BDR')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
              selectedCategory === 'BDR'
                ? 'bg-[#253A32] text-[#FFFFFF]'
                : 'text-[#5F635C] hover:text-[#242823]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            BDRs
          </button>
          <button
            onClick={() => setSelectedCategory('ETF')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
              selectedCategory === 'ETF'
                ? 'bg-[#253A32] text-[#FFFFFF]'
                : 'text-[#5F635C] hover:text-[#242823]'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            ETFs
          </button>
        </div>
      </div>

      {/* 3. Main Split View: Asset Detail & Interactive Chart + Quick List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Asset Detail Card & Historical Chart */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#FFFFFF] border border-[#E7E1D7] p-6 shadow-xs">
            {/* Header: Title, Ticker, Watchlist Toggle */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E7E1D7]">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-xl font-bold font-mono text-[#242823] tracking-tight">
                    {selectedSymbol}
                  </span>
                  {getCategoryBadge(activeAsset?.assetType)}
                  {activeAsset?.sector && (
                    <span className="text-xs text-[#777A72] border-l border-[#E7E1D7] pl-2.5">
                      {activeAsset.sector}
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-medium text-[#5F635C] mt-0.5">
                  {activeAsset?.name || 'Carregando informações do ativo...'}
                </h3>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onToggleWatchlist && onToggleWatchlist(`B3:${selectedSymbol}`)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border transition-colors ${
                    isWatchlisted
                      ? 'border-[#F59E0B] bg-[#FFFBEB] text-[#B45309]'
                      : 'border-[#E7E1D7] bg-[#FFFFFF] text-[#5F635C] hover:text-[#242823] hover:bg-[#F6F3ED]'
                  }`}
                  title={isWatchlisted ? 'Remover dos favoritos' : 'Acompanhar este ativo'}
                >
                  <Star className={`w-3.5 h-3.5 ${isWatchlisted ? 'fill-[#F59E0B] text-[#F59E0B]' : ''}`} />
                  <span>{isWatchlisted ? 'Acompanhando' : 'Favoritar'}</span>
                </button>

                <button
                  onClick={() => loadAssetDetails(selectedSymbol, selectedRange, true)}
                  disabled={isLoadingQuote}
                  className="p-1.5 border border-[#E7E1D7] bg-[#FFFFFF] text-[#5F635C] hover:text-[#242823] hover:bg-[#F6F3ED] transition-colors"
                  title="Atualizar cotação"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingQuote ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Price Overview */}
            <div className="py-5 grid grid-cols-2 sm:grid-cols-4 gap-4 items-baseline">
              <div>
                <span className="text-[11px] font-medium text-[#777A72] uppercase tracking-wider block mb-1">
                  Cotação Atual
                </span>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-2xl sm:text-3xl font-bold font-mono text-[#242823]">
                    {formatBRL(activeQuote?.price)}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[11px] font-medium text-[#777A72] uppercase tracking-wider block mb-1">
                  Variação Diária
                </span>
                <span
                  className={`inline-flex items-center text-sm font-semibold font-mono ${
                    isPositive ? 'text-[#15803D]' : 'text-[#B91C1C]'
                  }`}
                >
                  {isPositive ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                  {formatPercent(activeQuote?.change24hPct)} ({formatBRL(activeQuote?.change24hAmount)})
                </span>
              </div>

              <div>
                <span className="text-[11px] font-medium text-[#777A72] uppercase tracking-wider block mb-1">
                  Mín / Máx (Dia)
                </span>
                <div className="text-xs font-mono text-[#242823]">
                  {formatBRL(activeQuote?.dayLow)} - {formatBRL(activeQuote?.dayHigh)}
                </div>
              </div>

              <div>
                <span className="text-[11px] font-medium text-[#777A72] uppercase tracking-wider block mb-1">
                  Volume Negociado
                </span>
                <span className="text-xs font-mono text-[#242823]">
                  {formatVolume(activeQuote?.volume24h)}
                </span>
              </div>
            </div>

            {/* Stale Warning Banner if applicable */}
            {activeQuote?.isStale && (
              <div className="mb-4 p-2.5 bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#D97706]" />
                <span>
                  Dados obtidos do cache local. Horário de referência:{' '}
                  <strong>{new Date(activeQuote.quoteTimestamp).toLocaleTimeString('pt-BR')}</strong>.
                </span>
              </div>
            )}

            {/* Timeframe Selector & Chart */}
            <div className="mt-2 pt-4 border-t border-[#E7E1D7]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1.5 text-xs text-[#5F635C]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Histórico de Preços</span>
                </div>

                {/* Range Buttons */}
                <div className="flex items-center gap-1 bg-[#F6F3ED] p-0.5 border border-[#E7E1D7] text-[11px]">
                  {(['5d', '1mo', '6mo', '1y'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setSelectedRange(r)}
                      className={`px-2.5 py-1 font-mono font-medium transition-colors ${
                        selectedRange === r
                          ? 'bg-[#253A32] text-[#FFFFFF]'
                          : 'text-[#5F635C] hover:text-[#242823]'
                      }`}
                    >
                      {r.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recharts Area Chart */}
              <div className="h-64 w-full">
                {isLoadingQuote ? (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-[#777A72]">
                    <Loader2 className="w-6 h-6 animate-spin text-[#253A32]" />
                    <span className="text-xs">Carregando série histórica...</span>
                  </div>
                ) : candles.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={candles} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="marketGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={isPositive ? '#10B981' : '#B91C1C'} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={isPositive ? '#10B981' : '#B91C1C'} stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        stroke="#A8A29E"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(d) => {
                          const parts = String(d).split('-');
                          return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : d;
                        }}
                      />
                      <YAxis
                        domain={['auto', 'auto']}
                        stroke="#A8A29E"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `R$ ${v.toFixed(0)}`}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload as HistoricalCandle;
                            return (
                              <div className="bg-[#FFFFFF] border border-[#E7E1D7] p-2.5 shadow-md text-xs">
                                <div className="text-[10px] text-[#777A72] mb-1 font-mono">{data.date}</div>
                                <div className="font-bold font-mono text-[#242823]">{formatBRL(data.close)}</div>
                                <div className="text-[10px] text-[#5F635C] mt-1 font-mono">
                                  Mín: {formatBRL(data.low)} | Máx: {formatBRL(data.high)}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="close"
                        stroke={isPositive ? '#15803D' : '#B91C1C'}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#marketGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-[#777A72]">
                    Nenhum candle histórico disponível para o período selecionado.
                  </div>
                )}
              </div>
            </div>

            {/* 4. Fundamental Metrics Grid (FIIs, Stocks, Valuation) */}
            {activeQuote?.rawMetrics && (
              <div className="mt-6 pt-5 border-t border-[#E7E1D7]">
                <h4 className="text-xs font-semibold text-[#242823] uppercase tracking-wider mb-3">
                  Indicadores Fundamentalistas
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-[#F6F3ED] p-3 border border-[#E7E1D7]">
                    <span className="text-[10px] font-medium text-[#777A72] uppercase block">Dividend Yield (12m)</span>
                    <span className="text-sm font-bold font-mono text-[#15803D] mt-0.5 block">
                      {activeQuote.rawMetrics.dividendYield !== null && activeQuote.rawMetrics.dividendYield !== undefined
                        ? `${Number(activeQuote.rawMetrics.dividendYield).toFixed(2).replace('.', ',')}%`
                        : '--'}
                    </span>
                  </div>

                  <div className="bg-[#F6F3ED] p-3 border border-[#E7E1D7]">
                    <span className="text-[10px] font-medium text-[#777A72] uppercase block">Último Provento</span>
                    <span className="text-sm font-bold font-mono text-[#242823] mt-0.5 block">
                      {activeQuote.rawMetrics.lastDividend !== null && activeQuote.rawMetrics.lastDividend !== undefined
                        ? formatBRL(Number(activeQuote.rawMetrics.lastDividend))
                        : '--'}
                    </span>
                  </div>

                  <div className="bg-[#F6F3ED] p-3 border border-[#E7E1D7]">
                    <span className="text-[10px] font-medium text-[#777A72] uppercase block">Preço / Lucro (P/L)</span>
                    <span className="text-sm font-bold font-mono text-[#242823] mt-0.5 block">
                      {activeQuote.rawMetrics.priceToEarnings !== null && activeQuote.rawMetrics.priceToEarnings !== undefined
                        ? Number(activeQuote.rawMetrics.priceToEarnings).toFixed(2).replace('.', ',')
                        : '--'}
                    </span>
                  </div>

                  <div className="bg-[#F6F3ED] p-3 border border-[#E7E1D7]">
                    <span className="text-[10px] font-medium text-[#777A72] uppercase block">P / Valor Patrimonial</span>
                    <span className="text-sm font-bold font-mono text-[#242823] mt-0.5 block">
                      {activeQuote.rawMetrics.priceToBook !== null && activeQuote.rawMetrics.priceToBook !== undefined
                        ? Number(activeQuote.rawMetrics.priceToBook).toFixed(2).replace('.', ',')
                        : '--'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Curated Exploration List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-[#FFFFFF] border border-[#E7E1D7] p-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#E7E1D7]">
              <div>
                <h4 className="text-xs font-semibold text-[#242823] uppercase tracking-wider">
                  Destaques de {selectedCategory === 'ALL' ? 'Mercado' : selectedCategory}
                </h4>
                <span className="text-[11px] text-[#777A72]">Clique para analisar o ativo</span>
              </div>
              <span className="text-[10px] text-[#777A72] font-mono">B3</span>
            </div>

            <div className="divide-y divide-[#E7E1D7] mt-1">
              {CURATED_LISTS[selectedCategory].map((item) => {
                const quote = popularQuotes[item.symbol];
                const isSelected = selectedSymbol === item.symbol;
                const pos = (quote?.change24hPct ?? 0) >= 0;

                return (
                  <button
                    key={item.symbol}
                    onClick={() => handleSelectAsset(item.symbol)}
                    className={`w-full text-left py-3 px-2 flex items-center justify-between transition-colors ${
                      isSelected ? 'bg-[#F6F3ED] font-semibold' : 'hover:bg-[#F6F3ED]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[#242823]">{item.symbol}</span>
                        {getCategoryBadge(item.type)}
                      </div>
                      <span className="text-[11px] text-[#5F635C] truncate max-w-[130px] block mt-0.5">
                        {item.name}
                      </span>
                    </div>

                    <div className="text-right">
                      <div className="font-mono text-xs text-[#242823]">
                        {quote ? formatBRL(quote.price) : '--'}
                      </div>
                      <div
                        className={`font-mono text-[11px] font-medium flex items-center justify-end ${
                          pos ? 'text-[#15803D]' : 'text-[#B91C1C]'
                        }`}
                      >
                        {quote ? (
                          <>
                            {pos ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
                            {formatPercent(quote.change24hPct)}
                          </>
                        ) : (
                          '--'
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
