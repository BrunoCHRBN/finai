'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  LayoutDashboard, 
  PieChart, 
  Receipt, 
  Landmark, 
  Sparkles, 
  Plus, 
  RefreshCw,
  X,
  Command
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: string) => void;
  onOpenNewTxModal: () => void;
  onSyncPluggy: () => void;
  onRunAIDiagnosis: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  onSelectTab,
  onOpenNewTxModal,
  onSyncPluggy,
  onRunAIDiagnosis,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    {
      id: 'new-tx',
      title: 'Registrar Nova Despesa ou Receita',
      category: 'Ações Rápidas',
      icon: Plus,
      run: () => {
        onClose();
        onOpenNewTxModal();
      },
    },
    {
      id: 'ai-diag',
      title: 'Rodar Diagnóstico IA do Mês (< 200 tokens)',
      category: 'Inteligência Artificial',
      icon: Sparkles,
      run: () => {
        onClose();
        onRunAIDiagnosis();
      },
    },
    {
      id: 'sync-pluggy',
      title: 'Sincronizar Contas Bancárias (Pluggy Open Finance)',
      category: 'Open Finance',
      icon: RefreshCw,
      run: () => {
        onClose();
        onSyncPluggy();
      },
    },
    {
      id: 'tab-dash',
      title: 'Ir para Dashboard & Visão Geral',
      category: 'Navegação',
      icon: LayoutDashboard,
      run: () => {
        onClose();
        onSelectTab('dashboard');
      },
    },
    {
      id: 'tab-budgets',
      title: 'Ir para Orçamentos & Custos por Categoria',
      category: 'Navegação',
      icon: PieChart,
      run: () => {
        onClose();
        onSelectTab('budgets');
      },
    },
    {
      id: 'tab-txs',
      title: 'Ir para Extrato & Transações',
      category: 'Navegação',
      icon: Receipt,
      run: () => {
        onClose();
        onSelectTab('transactions');
      },
    },
    {
      id: 'tab-openfinance',
      title: 'Ir para Conexões Open Finance',
      category: 'Navegação',
      icon: Landmark,
      run: () => {
        onClose();
        onSelectTab('openfinance');
      },
    },
    {
      id: 'tab-copilot',
      title: 'Ir para Copiloto & Níveis de Maturidade',
      category: 'Navegação',
      icon: Sparkles,
      run: () => {
        onClose();
        onSelectTab('copilot');
      },
    },
  ];

  const filtered = actions.filter((a) =>
    a.title.toLowerCase().includes(query.toLowerCase()) ||
    a.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-xl rounded-2xl border border-[#1e2634] bg-[#0c0f14] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search header */}
        <div className="p-3 border-b border-[#1e2634] flex items-center gap-3">
          <Search className="w-5 h-5 text-emerald-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="O que você deseja fazer? (Ex: novo gasto, sincronizar, orçamentos)..."
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
            autoFocus
          />
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action list */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Nenhum comando encontrado para "{query}".
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={item.run}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-[#161c26] text-left transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300 group-hover:text-emerald-400 group-hover:bg-emerald-500/10 transition-colors">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white group-hover:text-emerald-400 transition-colors">
                        {item.title}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">{item.category}</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-600 group-hover:text-slate-400">
                    ↵ Executar
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-[#090b0e] border-t border-[#1e2634] flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span>Dica: Use as setas ou clique para selecionar</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700">ESC</kbd> para fechar
          </span>
        </div>
      </div>
    </div>
  );
}
