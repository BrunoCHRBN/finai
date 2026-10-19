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
  ArrowRight,
  Building2,
  TrendingUp,
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
      title: 'Executar Diagnóstico Analítico do Mês',
      category: 'Inteligência Financeira',
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
      title: 'Ir para Painel & Visão Geral',
      category: 'Navegação',
      icon: LayoutDashboard,
      run: () => {
        onClose();
        onSelectTab('dashboard');
      },
    },
    {
      id: 'tab-patrimony',
      title: 'Ir para Balanço Patrimonial & Ativos',
      category: 'Navegação',
      icon: Building2,
      run: () => {
        onClose();
        onSelectTab('patrimony');
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
      title: 'Ir para Conexões Institucionais',
      category: 'Navegação',
      icon: Landmark,
      run: () => {
        onClose();
        onSelectTab('openfinance');
      },
    },
    {
      id: 'tab-copilot',
      title: 'Ir para Parecer Patrimonial & Diretrizes',
      category: 'Navegação',
      icon: Sparkles,
      run: () => {
        onClose();
        onSelectTab('copilot');
      },
    },
    {
      id: 'tab-market',
      title: 'Ir para Inteligência de Mercado & Criptomoedas',
      category: 'Navegação',
      icon: TrendingUp,
      run: () => {
        onClose();
        onSelectTab('market');
      },
    },
  ];

  const filtered = actions.filter((a) =>
    a.title.toLowerCase().includes(query.toLowerCase()) ||
    a.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-[#242823]/40 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-xl rounded-xl border border-[#E7E1D7] bg-[#FFFFFF] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search header */}
        <div className="p-3.5 border-b border-[#E7E1D7] flex items-center gap-3 bg-[#FAF8F5]">
          <Search className="w-4 h-4 text-[#253A32] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar comando ou destino (ex: novo lançamento, conciliar, orçamentos)..."
            className="w-full bg-transparent text-sm text-[#242823] placeholder-[#777A72] focus:outline-none"
            autoFocus
          />
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#777A72] hover:text-[#242823] hover:bg-[#E7E1D7]/50 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action list */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#777A72]">
              Nenhum comando localizado para &quot;{query}&quot;.
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={item.run}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[#FAF8F5] text-left transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-md bg-[#F0EDE6] text-[#253A32] group-hover:bg-[#253A32] group-hover:text-white transition-colors">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-[#242823] group-hover:text-[#253A32] transition-colors">
                        {item.title}
                      </div>
                      <div className="text-[10px] text-[#777A72] font-mono">{item.category}</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-[#777A72] group-hover:text-[#253A32] flex items-center gap-1">
                    <span>Executar</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-[#F0EDE6] border-t border-[#E7E1D7] flex items-center justify-between text-[10px] text-[#777A72] font-mono">
          <span>Navegue pelas ações e pressione Enter</span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-[#FFFFFF] border border-[#E7E1D7] text-[#242823] font-mono">ESC</kbd>
            <span>para dispensar</span>
          </span>
        </div>
      </div>
    </div>
  );
}
