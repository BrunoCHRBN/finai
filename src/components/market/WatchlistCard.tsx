'use client';

import React, { useState } from 'react';
import {
  Star,
  Bell,
  Trash2,
  Coins,
  Building,
  X,
  Save,
  Loader2,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import type { MarketWatchlistItem } from '@/lib/market/types';

interface WatchlistCardProps {
  items: MarketWatchlistItem[];
  isLoading?: boolean;
  onRemoveItem: (id: string) => Promise<void>;
  onUpdateAlerts: (
    id: string,
    updates: { targetPriceAlertLow?: number | null; targetPriceAlertHigh?: number | null; notes?: string | null }
  ) => Promise<void>;
  onSelectAsset?: (symbol: string, market: 'B3' | 'CRYPTO') => void;
}

function formatBRL(value?: number | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return 'R$ --';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatUSDT(value?: number | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '$ --';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
}

export function WatchlistCard({
  items,
  isLoading = false,
  onRemoveItem,
  onUpdateAlerts,
  onSelectAsset,
}: WatchlistCardProps) {
  const [editingItem, setEditingItem] = useState<MarketWatchlistItem | null>(null);
  const [targetLow, setTargetLow] = useState<string>('');
  const [targetHigh, setTargetHigh] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenEditModal = (item: MarketWatchlistItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingItem(item);
    setTargetLow(
      item.targetPriceAlertLow !== null && item.targetPriceAlertLow !== undefined
        ? String(item.targetPriceAlertLow)
        : ''
    );
    setTargetHigh(
      item.targetPriceAlertHigh !== null && item.targetPriceAlertHigh !== undefined
        ? String(item.targetPriceAlertHigh)
        : ''
    );
    setNotes(item.notes || '');
  };

  const handleCloseModal = () => {
    setEditingItem(null);
    setTargetLow('');
    setTargetHigh('');
    setNotes('');
  };

  const handleSaveAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setIsSaving(true);
    try {
      const lowNum = targetLow.trim() === '' ? null : parseFloat(targetLow.replace(',', '.'));
      const highNum = targetHigh.trim() === '' ? null : parseFloat(targetHigh.replace(',', '.'));
      await onUpdateAlerts(editingItem.id, {
        targetPriceAlertLow: Number.isNaN(lowNum) ? null : lowNum,
        targetPriceAlertHigh: Number.isNaN(highNum) ? null : highNum,
        notes: notes.trim() === '' ? null : notes.trim(),
      });
      handleCloseModal();
    } catch (err) {
      console.error('Failed to update alert:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white border border-[#E7E1D7] rounded-xl overflow-hidden shadow-xs">
      {/* Header */}
      <div className="p-4 border-b border-[#E7E1D7] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
          <h3 className="font-serif font-semibold text-[15px] text-[#242823]">
            Lista de Acompanhamento & Alertas
          </h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#F6F3ED] text-[#777A72] border border-[#E7E1D7]">
            {items.length} {items.length === 1 ? 'ativo' : 'ativos'}
          </span>
        </div>
        <div className="text-[11px] font-sans text-[#777A72]">
          Monitoramento de cotações
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="p-8 flex flex-col items-center justify-center gap-2 text-[#777A72]">
          <Loader2 className="w-5 h-5 animate-spin text-[#253A32]" />
          <span className="text-[12px] font-sans">Carregando lista de ativos...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-[#F6F3ED] border border-[#E7E1D7] flex items-center justify-center mx-auto text-[#777A72]">
            <Star className="w-5 h-5" />
          </div>
          <p className="text-[13px] font-sans font-medium text-[#242823]">
            Nenhum ativo na lista de acompanhamento
          </p>
          <p className="text-[12px] font-sans text-[#777A72] max-w-sm mx-auto">
            Favorite ações da B3 ou criptomoedas clicando na estrela para monitorar cotações e definir preços-alvo com alertas.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#E7E1D7]">
          {items.map((item) => {
            const isCrypto = item.asset?.market === 'CRYPTO';
            const symbol = item.asset?.symbol || item.assetId.replace(/^(B3|CRYPTO):/, '');
            const name = item.asset?.name || symbol;
            const market = item.asset?.market || (item.assetId.startsWith('CRYPTO:') ? 'CRYPTO' : 'B3');

            // Price & Change resolution
            let currentPrice: number | null = null;
            let change24hPct: number | null = null;
            let secondaryPrice: string | null = null;

            if (isCrypto && item.cryptoDualQuote) {
              currentPrice = item.cryptoDualQuote.priceUsdt;
              change24hPct = item.cryptoDualQuote.change24hPct;
              secondaryPrice = item.cryptoDualQuote.priceBrl != null
                ? `≈ ${formatBRL(item.cryptoDualQuote.priceBrl)}`
                : null;
            } else if (item.latestQuote) {
              currentPrice = item.latestQuote.price;
              change24hPct = item.latestQuote.change24hPct;
            }

            const finalChangePct = typeof change24hPct === 'number' && Number.isFinite(change24hPct) ? change24hPct : null;
            const isPos = finalChangePct !== null && finalChangePct > 0;
            const isNeg = finalChangePct !== null && finalChangePct < 0;

            // Target calculations
            const hasLowTarget = item.targetPriceAlertLow !== null && item.targetPriceAlertLow !== undefined;
            const hasHighTarget = item.targetPriceAlertHigh !== null && item.targetPriceAlertHigh !== undefined;
            const lowReached = hasLowTarget && currentPrice !== null && currentPrice <= (item.targetPriceAlertLow as number);
            const highReached = hasHighTarget && currentPrice !== null && currentPrice >= (item.targetPriceAlertHigh as number);

            return (
              <div
                key={item.id}
                onClick={() => onSelectAsset && onSelectAsset(symbol, market)}
                className="p-3.5 hover:bg-[#F6F3ED]/60 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                {/* Asset details */}
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                      isCrypto
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {isCrypto ? <Coins className="w-4 h-4" /> : <Building className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-[14px] text-[#242823]">
                        {symbol}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#F6F3ED] text-[#777A72] border border-[#E7E1D7]">
                        {market}
                      </span>
                      {item.asset?.assetType && (
                        <span className="text-[10px] font-sans px-1.5 py-0.2 rounded bg-neutral-100 text-neutral-600">
                          {item.asset.assetType}
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] font-sans text-[#777A72] line-clamp-1">
                      {name}
                    </div>

                    {/* Alerts Summary Badge */}
                    <div className="flex items-center gap-2 mt-1">
                      {hasLowTarget && (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                            lowReached
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold'
                              : 'bg-neutral-50 text-neutral-600 border-[#E7E1D7]'
                          }`}
                        >
                          <Bell className="w-2.5 h-2.5" />
                          Alvo Baixa: {isCrypto ? `$ ${item.targetPriceAlertLow}` : `R$ ${item.targetPriceAlertLow}`}
                          {lowReached && ' (Atingido!)'}
                        </span>
                      )}
                      {hasHighTarget && (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                            highReached
                              ? 'bg-red-100 text-red-800 border-red-300 font-semibold'
                              : 'bg-neutral-50 text-neutral-600 border-[#E7E1D7]'
                          }`}
                        >
                          <Bell className="w-2.5 h-2.5" />
                          Alvo Alta: {isCrypto ? `$ ${item.targetPriceAlertHigh}` : `R$ ${item.targetPriceAlertHigh}`}
                          {highReached && ' (Atingido!)'}
                        </span>
                      )}
                      {item.notes && (
                        <span className="text-[11px] font-sans text-[#777A72] italic line-clamp-1">
                          “{item.notes}”
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side: Prices & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                  <div className="text-right">
                    <div className="font-mono text-[14px] font-bold text-[#242823]">
                      {isCrypto ? formatUSDT(currentPrice) : formatBRL(currentPrice)}
                    </div>
                    {secondaryPrice && (
                      <div className="text-[10px] font-mono text-[#253A32]">
                        {secondaryPrice}
                      </div>
                    )}
                    {finalChangePct !== null ? (
                      <div
                        className={`text-[11px] font-mono flex items-center justify-end gap-0.5 ${
                          isPos ? 'text-emerald-700' : isNeg ? 'text-red-700' : 'text-[#777A72]'
                        }`}
                      >
                        {isPos ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : isNeg ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : null}
                        <span>
                          {isPos ? '+' : ''}
                          {finalChangePct.toFixed(2).replace('.', ',')}%
                        </span>
                      </div>
                    ) : (
                      <div className="text-[11px] font-mono text-[#777A72] text-right">--</div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => handleOpenEditModal(item, e)}
                      className="p-1.5 text-[#777A72] hover:text-[#253A32] hover:bg-[#F6F3ED] rounded transition-colors"
                      title="Configurar Alertas"
                    >
                      <Bell className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await onRemoveItem(item.id);
                      }}
                      className="p-1.5 text-[#777A72] hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Remover da lista"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Alerts Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4">
          <div className="bg-white border border-[#E7E1D7] rounded-xl max-w-md w-full shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-[#E7E1D7] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#253A32]" />
                <h4 className="font-serif font-semibold text-[15px] text-[#242823]">
                  Alertas de Preço — {editingItem.asset?.symbol || editingItem.assetId}
                </h4>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-1 text-[#777A72] hover:text-[#242823] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAlerts} className="p-4 space-y-4">
              <div className="text-[12px] font-sans text-[#777A72]">
                Defina patamares de preço para receber indicações de oportunidade quando a cotação atingir os limites estipulados.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-mono uppercase text-[#777A72]">
                    Alvo de Baixa ({editingItem.asset?.currency || 'BRL'})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={targetLow}
                    onChange={(e) => setTargetLow(e.target.value)}
                    placeholder="Ex: 32.50"
                    className="w-full px-3 py-2 bg-white border border-[#E7E1D7] rounded-md text-[13px] font-mono text-[#242823] focus:outline-none focus:border-[#253A32]"
                  />
                  <span className="text-[10px] text-[#777A72]">
                    Dispara quando o preço cair até aqui.
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono uppercase text-[#777A72]">
                    Alvo de Alta ({editingItem.asset?.currency || 'BRL'})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={targetHigh}
                    onChange={(e) => setTargetHigh(e.target.value)}
                    placeholder="Ex: 40.00"
                    className="w-full px-3 py-2 bg-white border border-[#E7E1D7] rounded-md text-[13px] font-mono text-[#242823] focus:outline-none focus:border-[#253A32]"
                  />
                  <span className="text-[10px] text-[#777A72]">
                    Dispara quando o preço subir até aqui.
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono uppercase text-[#777A72]">
                  Notas / Racional de Acompanhamento
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Posição de longo prazo focada em dividendos / Acúmulo de satoshis"
                  className="w-full px-3 py-2 bg-white border border-[#E7E1D7] rounded-md text-[13px] text-[#242823] focus:outline-none focus:border-[#253A32]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E7E1D7]">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-3 py-1.5 text-[12px] font-sans text-[#5F635C] hover:text-[#242823] rounded-md"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-[#253A32] text-white rounded-md text-[12px] font-sans font-medium hover:bg-[#1B2B25] transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Salvar Alertas</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
