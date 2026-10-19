'use client';

import React, { useEffect } from 'react';
import { 
  LayoutDashboard, 
  PieChart, 
  Receipt, 
  Landmark, 
  ChartNoAxesCombined,
  Building2,
  TrendingUp,
  X
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  maturityLevel?: number;
  tokenCount?: number;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({
  currentTab,
  onSelectTab,
  isOpen = false,
  onClose,
}: SidebarProps) {
  const navSections = [
    {
      group: 'Finanças',
      items: [
        { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
        { id: 'patrimony', label: 'Patrimônio', icon: Building2 },
        { id: 'transactions', label: 'Movimentações', icon: Receipt },
        { id: 'budgets', label: 'Planejamento & Metas', icon: PieChart },
      ],
    },
    {
      group: 'Análises',
      items: [
        { id: 'copilot', label: 'Análise financeira', icon: ChartNoAxesCombined },
        { id: 'market', label: 'Mercado & Cripto', icon: TrendingUp },
      ],
    },
    {
      group: 'Conexões',
      items: [
        { id: 'openfinance', label: 'Contas conectadas', icon: Landmark },
      ],
    },
  ];

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleItemClick = (id: string) => {
    onSelectTab(id);
    if (onClose) {
      onClose();
    }
  };

  const navContent = (
    <div className="flex flex-col h-full bg-[#FFFFFF]">
      {/* Brand Header */}
      <div className="h-16 border-b border-[#E7E1D7] px-5 flex items-center justify-between shrink-0">
        <div>
          <div className="font-serif font-semibold text-lg text-[#242823] tracking-tight">FinAI</div>
          <div className="text-[11px] font-sans text-[#777A72]">Finanças e patrimônio</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-2 -mr-2 text-[#777A72] hover:text-[#242823] rounded-md transition-colors"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <div className="p-3 space-y-6 flex-1 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.group} className="space-y-1.5">
            <div className="px-3 text-[11px] font-sans font-medium uppercase tracking-wider text-[#777A72]">
              {section.group}
            </div>
            <nav className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center px-3 py-3 sm:py-2.5 border-l-2 text-[13px] font-sans text-left transition-colors cursor-pointer rounded-r-md ${
                      isActive
                        ? 'border-[#253A32] bg-[#F6F3ED] text-[#242823] font-semibold shadow-xs'
                        : 'border-transparent text-[#5F635C] hover:text-[#242823] hover:bg-[#F6F3ED]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#253A32]' : 'text-[#777A72]'}`} />
                      <span>{item.label}</span>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-[#E7E1D7] text-[11px] text-[#777A72] font-sans">
        <span className="block font-medium text-[#242823]">Plataforma Patrimonial</span>
        <span className="block text-[10px]">Open Finance & IA Determinística</span>
      </div>
    </div>
  );

  return (
    <>
      {/* 1. Desktop Persistent Sidebar */}
      <aside className="hidden lg:flex w-60 border-r border-[#E7E1D7] bg-[#FFFFFF] flex-col shrink-0 select-none h-screen sticky top-0 z-30">
        {navContent}
      </aside>

      {/* 2. Mobile / Tablet Slide-out Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[#242823]/40 backdrop-blur-xs transition-opacity duration-200"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer Pane */}
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
}
