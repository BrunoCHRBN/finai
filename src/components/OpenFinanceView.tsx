'use client';

import React, { useState } from 'react';
import { 
  Landmark, 
  CreditCard, 
  RefreshCw, 
  Plus, 
  CheckCircle2, 
  ShieldCheck, 
  ExternalLink,
  Lock,
  ArrowRight
} from 'lucide-react';

interface OpenFinanceViewProps {
  accounts: any[];
  isSyncing: boolean;
  onSync: () => void;
  onOpenPluggyConnect: () => void;
}

export function OpenFinanceView({
  accounts,
  isSyncing,
  onSync,
  onOpenPluggyConnect,
}: OpenFinanceViewProps) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const popularConnectors = [
    { name: 'Nubank', logo: '🟣', type: 'Conta & Cartão de Crédito' },
    { name: 'Itaú Unibanco', logo: '🟧', type: 'Conta Corrente & Cartão' },
    { name: 'Banco Inter', logo: '🟠', type: 'Conta Global & Investimentos' },
    { name: 'Bradesco', logo: '🔴', type: 'Conta Corrente & Cartão' },
    { name: 'Santander Brasil', logo: '🔺', type: 'Conta & Cartão' },
    { name: 'XP Investimentos', logo: '⬛', type: 'Custódia & Carteira' },
    { name: 'BTG Pactual', logo: '🔷', type: 'Banking & Investimentos' },
    { name: 'C6 Bank', logo: '⚫', type: 'Conta & Cartão Carbon' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-[#0c141c] to-[#0f1319] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Open Finance Brasil via Pluggy</span>
          </div>
          <h2 className="text-lg font-bold text-white">
            Contas Conectadas e Sincronização
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Conexão direta com seus bancos via Pluggy. Os extratos alimentam o cálculo local e nenhuma senha fica salva no aplicativo.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#1e2634] bg-[#12161f] text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Atualizar Todas as Contas'}</span>
          </button>

          <button
            onClick={onOpenPluggyConnect}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            <span>Conectar Nova Instituição</span>
          </button>
        </div>
      </div>

      {/* Connected Accounts Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
            Contas e Cartões Conectados ({accounts.length})
          </h3>
          <span className="text-[11px] text-slate-500">Sincronização em Nuvem Ativa</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {accounts.map((acc) => {
            const isCard = acc.type === 'CREDIT_CARD';
            const isNegative = acc.balance < 0;

            return (
              <div
                key={acc.id}
                className="p-4 rounded-xl border border-[#1e2634] bg-[#0f1319] hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm"
                        style={{ backgroundColor: acc.color || '#3b82f6' }}
                      >
                        {isCard ? <CreditCard className="w-4 h-4" /> : <Landmark className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white truncate max-w-[140px]">{acc.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{acc.institutionName || 'Banco'}</div>
                      </div>
                    </div>

                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      ATIVO
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-[#1e2634]/60">
                  <div className="text-[10px] text-slate-500 uppercase font-mono">
                    {isCard ? 'Fatura Atual (A Pagar)' : 'Saldo Disponível'}
                  </div>
                  <div className={`text-base font-bold font-mono tabular-nums ${isCard || isNegative ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {formatCurrency(acc.balance)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Available Supported Connectors in Brazil */}
      <div className="p-5 rounded-2xl border border-[#1e2634] bg-[#0f1319]">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono mb-3">
          Instituições Financeiras Prontas para Conexão
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {popularConnectors.map((c, i) => (
            <div
              key={i}
              onClick={onOpenPluggyConnect}
              className="p-3 rounded-xl border border-[#1e2634] bg-[#12161f] hover:border-emerald-500/50 hover:bg-[#161c28] transition-all cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">{c.logo}</span>
                <div>
                  <div className="text-xs font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">
                    {c.name}
                  </div>
                  <div className="text-[10px] text-slate-500">{c.type}</div>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
