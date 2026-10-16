'use client';

import React from 'react';
import { 
  LayoutDashboard, 
  PieChart, 
  Receipt, 
  Landmark, 
  Sparkles, 
  ChevronRight,
  ShieldCheck,
  Building2
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  maturityLevel: number;
  tokenCount: number;
}

export function Sidebar({ currentTab, onSelectTab }: SidebarProps) {
  const navSections = [
    {
      group: 'FINANCEIRO',
      items: [
        { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
        { id: 'patrimony', label: 'Patrimônio & Balanço', icon: Building2 },
        { id: 'transactions', label: 'Movimentações', icon: Receipt },
        { id: 'budgets', label: 'Planejamento & Metas', icon: PieChart },
      ],
    },
    {
      group: 'INTELIGÊNCIA',
      items: [
        { id: 'copilot', label: 'Copiloto & Análise', icon: Sparkles },
      ],
    },
    {
      group: 'INTEGRAÇÕES',
      items: [
        { id: 'openfinance', label: 'Contas & Open Finance', icon: Landmark },
      ],
    },
  ];

  return (
    <aside className="w-60 border-r border-[#E7E1D7] bg-[#FFFFFF] flex flex-col justify-between shrink-0 select-none h-screen sticky top-0 z-30">
      <div>
        {/* Institutional Brand Header */}
        <div className="h-16 border-b border-[#E7E1D7] px-5 flex items-center justify-between bg-[#FFFFFF]">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-[#253A32] flex items-center justify-center text-white shadow-xs">
              <span className="font-serif text-sm font-semibold tracking-wider text-[#F6F3ED]">F</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-serif font-bold text-base tracking-tight text-[#242823]">FinAI</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded font-sans font-medium bg-[#F0EDE6] text-[#5F635C] border border-[#E7E1D7]">
                  Terminal
                </span>
              </div>
              <div className="text-[11px] font-sans text-[#777A72] tracking-tight">Institutional Wealth</div>
            </div>
          </div>
        </div>

        {/* Grouped Navigation */}
        <div className="p-3 space-y-5">
          {navSections.map((section) => (
            <div key={section.group} className="space-y-1">
              <div className="px-3 text-[10px] font-sans font-semibold tracking-wider text-[#777A72] uppercase">
                {section.group}
              </div>
              <nav className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectTab(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-sans transition-colors ${
                        isActive
                          ? 'bg-[#F0EDE6] text-[#242823] font-semibold border border-[#E7E1D7]'
                          : 'text-[#5F635C] hover:text-[#242823] hover:bg-[#F3F1EB]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-[#253A32]' : 'text-[#777A72]'}`} />
                        <span>{item.label}</span>
                      </div>
                      {isActive && <ChevronRight className="w-3.5 h-3.5 text-[#253A32]" />}
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Info & Keyboard Cue */}
      <div className="p-3 border-t border-[#E7E1D7] bg-[#FFFFFF] space-y-2.5">
        <div className="px-2 py-1.5 rounded-md bg-[#F0EDE6] border border-[#E7E1D7] flex items-center justify-between text-[11px] font-sans">
          <div className="flex items-center gap-1.5 text-[#245A3C]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="font-medium text-[11px]">Open Finance Ativo</span>
          </div>
          <span className="text-[10px] font-mono text-[#5F635C]">Pluggy v2</span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-[#5F635C] px-1 font-sans">
          <span className="text-[11px] text-[#777A72]">Comandos Rápidos</span>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-[#F3F1EB] border border-[#E7E1D7] rounded text-[#242823]">
            Ctrl K
          </kbd>
        </div>
      </div>
    </aside>
  );
}
