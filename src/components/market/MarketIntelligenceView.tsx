'use client';

import React, { useState, useEffect, useCallback, useTransition } from 'react';
import {
  TrendingUp,
  Coins,
  Building,
  Star,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  Clock,
  Sparkles,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { StockMarketSection } from './StockMarketSection';
import { CryptoMarketSection } from './CryptoMarketSection';
import { WatchlistCard } from './WatchlistCard';
import type { MarketWatchlistItem, MarketOverviewSummary } from '@/lib/market/types';

export function MarketIntelligenceView() {
  const [activeTab, setActiveTab] = useState<'B3' | 'CRYPTO' | 'WATCHLIST'>('B3');
  const [selectedB3Symbol, setSelectedB3Symbol] = useState<string | null>(null);
  const [selectedCryptoSymbol, setSelectedCryptoSymbol] = useState<string | null>(null);
  const [overview, setOverview] = useState<MarketOverviewSummary | null>(null);
  const [watchlist, setWatchlist] = useState<MarketWatchlistItem[]>([]);
  const [isLoadingOverview, setIsLoadingOverview] = useState(true);
  const [isLoadingWatchlist, setIsLoadingWatchlist] = useState(true);
  const [, startTransition] = useTransition();

  // 1. Fetch Market Overview
  const fetchOverview = useCallback(async (refresh = false) => {
    setIsLoadingOverview(true);
    try {
      const res = await fetch(`/api/market/overview${refresh ? '?refresh=true' : ''}`);
      if (res.ok) {
        const data = await res.json();
        setOverview(data);
      }
    } catch (err) {
      console.warn('Error loading market overview:', err);
    } finally {
      setIsLoadingOverview(false);
    }
  }, []);

  // 2. Fetch Watchlist
  const fetchWatchlist = useCallback(async () => {
    setIsLoadingWatchlist(true);
    try {
      const res = await fetch('/api/market/watchlist');
      if (res.ok) {
        const data = await res.json();
        setWatchlist(data.items || []);
      }
    } catch (err) {
      console.warn('Error loading watchlist:', err);
    } finally {
      setIsLoadingWatchlist(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    fetchWatchlist();
  }, [fetchOverview, fetchWatchlist]);

  // Set of asset IDs currently in watchlist for fast O(1) lookups
  const watchlistAssetIds = new Set(watchlist.map((w) => w.assetId));

  // Toggle watchlist (Add if missing, remove if present)
  const handleToggleWatchlist = async (assetId: string) => {
    const existing = watchlist.find((w) => w.assetId === assetId);
    if (existing) {
      await handleRemoveWatchlistItem(existing.id);
    } else {
      try {
        const res = await fetch('/api/market/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId }),
        });
        if (res.ok) {
          await fetchWatchlist();
        }
      } catch (err) {
        console.error('Failed to add to watchlist:', err);
      }
    }
  };

  // Remove watchlist item by id
  const handleRemoveWatchlistItem = async (id: string) => {
    try {
      const res = await fetch(`/api/market/watchlist/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setWatchlist((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (err) {
      console.error('Failed to remove from watchlist:', err);
    }
  };

  // Update watchlist alerts
  const handleUpdateAlerts = async (
    id: string,
    updates: { targetPriceAlertLow?: number | null; targetPriceAlertHigh?: number | null; notes?: string | null }
  ) => {
    try {
      const res = await fetch(`/api/market/watchlist/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        await fetchWatchlist();
      }
    } catch (err) {
      console.error('Failed to update watchlist alerts:', err);
    }
  };

  // Quick navigation from watchlist click
  const handleSelectAssetFromWatchlist = (symbol: string, market: 'B3' | 'CRYPTO') => {
    startTransition(() => {
      if (market === 'CRYPTO') {
        setSelectedCryptoSymbol(symbol);
        setActiveTab('CRYPTO');
      } else {
        setSelectedB3Symbol(symbol);
        setActiveTab('B3');
      }
    });
  };

  // Top Macro Indicators (Ibovespa, IFIX, USD/BRL rate, BTC, ETH)
  const ibov = overview?.indices.find((i) => i.id === 'B3:^BVSP' || i.assetId === 'B3:^BVSP');
  const ifix = overview?.indices.find((i) => i.id === 'B3:IFIX' || i.assetId === 'B3:IFIX');
  const btc = overview?.cryptoHighlights.find((c) => c.symbol === 'BTCUSDT');
  const eth = overview?.cryptoHighlights.find((c) => c.symbol === 'ETHUSDT');

  return (
    <div className="space-y-6 pb-12">
      {/* 1. View Header with Disclaimers & Integrity Notice */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E7E1D7] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-serif font-bold text-2xl text-[#242823]">
              Inteligência de Mercado
            </h1>
            <span className="text-[11px] font-sans px-2.5 py-0.5 rounded-full bg-[#253A32] text-white font-medium">
              Market Intelligence
            </span>
          </div>
          <p className="text-[13px] font-sans text-[#777A72] mt-1">
            Monitoramento de cotações da B3 (Ações, FIIs, BDRs, ETFs) e Criptomoedas com paridade USDT/BRL.
          </p>
        </div>

        {/* Global Refresh Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchOverview(true);
              fetchWatchlist();
            }}
            disabled={isLoadingOverview}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#E7E1D7] hover:bg-[#F6F3ED] text-[#242823] rounded-lg text-[12px] font-sans font-medium transition-colors shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOverview ? 'animate-spin' : ''}`} />
            <span>Atualizar Cotações</span>
          </button>
        </div>
      </div>

      {/* 2. Institutional Macro Ticker Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* Ibovespa */}
        <div className="bg-white p-3.5 rounded-xl border border-[#E7E1D7] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-[#777A72]">Ibovespa</span>
            {ibov && ibov.change24hPct != null && (
              <span
                className={`text-[11px] font-mono font-medium flex items-center ${
                  ibov.change24hPct >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {ibov.change24hPct >= 0 ? '+' : ''}
                {ibov.change24hPct.toFixed(2).replace('.', ',')}%
              </span>
            )}
          </div>
          <div className="font-mono text-[16px] font-bold text-[#242823] mt-1">
            {ibov && ibov.price != null ? `${ibov.price.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} pts` : '--'}
          </div>
          <div className="text-[10px] font-sans text-[#777A72]">B3 Índice Principal</div>
        </div>

        {/* IFIX */}
        <div className="bg-white p-3.5 rounded-xl border border-[#E7E1D7] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-[#777A72]">IFIX</span>
            {ifix && ifix.change24hPct != null && (
              <span
                className={`text-[11px] font-mono font-medium flex items-center ${
                  ifix.change24hPct >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {ifix.change24hPct >= 0 ? '+' : ''}
                {ifix.change24hPct.toFixed(2).replace('.', ',')}%
              </span>
            )}
          </div>
          <div className="font-mono text-[16px] font-bold text-[#242823] mt-1">
            {ifix && ifix.price != null ? `${ifix.price.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} pts` : '--'}
          </div>
          <div className="text-[10px] font-sans text-[#777A72]">Fundos Imobiliários</div>
        </div>

        {/* Câmbio USDT/BRL */}
        <div className="bg-white p-3.5 rounded-xl border border-[#E7E1D7] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-[#777A72]">USDT / BRL</span>
            <span className="text-[10px] font-mono text-[#253A32] bg-[#253A32]/10 px-1 rounded">Spot</span>
          </div>
          <div className="font-mono text-[16px] font-bold text-[#242823] mt-1">
            {overview?.usdtBrlRate != null
              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(overview.usdtBrlRate)
              : 'Indisponível'}
          </div>
          <div className="text-[10px] font-sans text-[#777A72]">Câmbio Paridade Binance</div>
        </div>

        {/* Bitcoin USDT */}
        <div className="bg-white p-3.5 rounded-xl border border-[#E7E1D7] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-[#777A72]">Bitcoin</span>
            {btc && btc.change24hPct != null && (
              <span
                className={`text-[11px] font-mono font-medium flex items-center ${
                  btc.change24hPct >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {btc.change24hPct >= 0 ? '+' : ''}
                {btc.change24hPct.toFixed(2).replace('.', ',')}%
              </span>
            )}
          </div>
          <div className="font-mono text-[16px] font-bold text-[#242823] mt-1">
            {btc && btc.priceUsdt != null ? `$ ${btc.priceUsdt.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '--'}
          </div>
          <div className="text-[10px] font-mono text-[#253A32]">
            {btc && btc.priceBrl != null ? `≈ R$ ${(btc.priceBrl / 1000).toFixed(0)}k` : '--'}
          </div>
        </div>

        {/* Ethereum USDT */}
        <div className="bg-white p-3.5 rounded-xl border border-[#E7E1D7] shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-[#777A72]">Ethereum</span>
            {eth && eth.change24hPct != null && (
              <span
                className={`text-[11px] font-mono font-medium flex items-center ${
                  eth.change24hPct >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {eth.change24hPct >= 0 ? '+' : ''}
                {eth.change24hPct.toFixed(2).replace('.', ',')}%
              </span>
            )}
          </div>
          <div className="font-mono text-[16px] font-bold text-[#242823] mt-1">
            {eth && eth.priceUsdt != null ? `$ ${eth.priceUsdt.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '--'}
          </div>
          <div className="text-[10px] font-mono text-[#253A32]">
            {eth && eth.priceBrl != null ? `≈ R$ ${(eth.priceBrl / 1000).toFixed(1)}k` : '--'}
          </div>
        </div>
      </div>

      {/* 3. Section Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E7E1D7] pb-px">
        <button
          onClick={() => setActiveTab('B3')}
          className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-sans border-b-2 transition-colors ${
            activeTab === 'B3'
              ? 'border-[#253A32] text-[#242823] font-semibold'
              : 'border-transparent text-[#777A72] hover:text-[#242823]'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Mercado Brasileiro (B3)</span>
        </button>

        <button
          onClick={() => setActiveTab('CRYPTO')}
          className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-sans border-b-2 transition-colors ${
            activeTab === 'CRYPTO'
              ? 'border-[#253A32] text-[#242823] font-semibold'
              : 'border-transparent text-[#777A72] hover:text-[#242823]'
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>Criptomoedas (USDT / BRL)</span>
        </button>

        <button
          onClick={() => setActiveTab('WATCHLIST')}
          className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-sans border-b-2 transition-colors ${
            activeTab === 'WATCHLIST'
              ? 'border-[#253A32] text-[#242823] font-semibold'
              : 'border-transparent text-[#777A72] hover:text-[#242823]'
          }`}
        >
          <Star className={`w-4 h-4 ${watchlist.length > 0 ? 'text-amber-500 fill-amber-400' : ''}`} />
          <span>Acompanhamento & Alertas</span>
          {watchlist.length > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[#F6F3ED] text-[#253A32] border border-[#E7E1D7]">
              {watchlist.length}
            </span>
          )}
        </button>
      </div>

      {/* 4. Active Sub-View */}
      {activeTab === 'B3' && (
        <StockMarketSection
          watchlistAssetIds={watchlistAssetIds}
          onToggleWatchlist={handleToggleWatchlist}
          selectedSymbol={selectedB3Symbol}
          onSelectSymbol={setSelectedB3Symbol}
        />
      )}

      {activeTab === 'CRYPTO' && (
        <CryptoMarketSection
          watchlistAssetIds={watchlistAssetIds}
          onToggleWatchlist={handleToggleWatchlist}
          selectedSymbol={selectedCryptoSymbol}
          onSelectSymbol={setSelectedCryptoSymbol}
        />
      )}

      {activeTab === 'WATCHLIST' && (
        <div className="space-y-6">
          <WatchlistCard
            items={watchlist}
            isLoading={isLoadingWatchlist}
            onRemoveItem={handleRemoveWatchlistItem}
            onUpdateAlerts={handleUpdateAlerts}
            onSelectAsset={handleSelectAssetFromWatchlist}
          />
        </div>
      )}

      {/* 5. Non-negotiable Financial Integrity & Disclaimers Footer */}
      <div className="p-4 bg-[#F6F3ED] rounded-xl border border-[#E7E1D7] text-[12px] font-sans text-[#777A72] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#253A32] shrink-0" />
          <span>
            <strong>Integridade Financeira FinAI:</strong> As cotações, variações e favoritos de mercado têm finalidade estritamente informativa. Não alteram saldos bancários sincronizados (Open Finance), movimentações do mês ou seu patrimônio líquido consolidado.
          </span>
        </div>
        <div className="text-[11px] font-mono shrink-0 text-[#A1A49D]">
          Provedores: brapi.dev & Binance Spot
        </div>
      </div>
    </div>
  );
}
