'use client';

import React from 'react';
import { 
  LayoutDashboard, 
  PieChart, 
  Receipt, 
  Landmark, 
  ChartNoAxesCombined,
  Building2,
  TrendingUp,
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

  return (
    <aside className="w-60 border-r border-[#E7E1D7] bg-[#FFFFFF] flex flex-col shrink-0 select-none h-screen sticky top-0 z-30">
      <div>
        <div className="h-16 border-b border-[#E7E1D7] px-5 flex items-center bg-[#FFFFFF]">
          <div>
            <div className="font-serif font-semibold text-lg text-[#242823]">FinAI</div>
            <div className="text-[11px] font-sans text-[#777A72]">Finanças e patrimônio</div>
          </div>
        </div>

        <div className="p-3 space-y-6">
          {navSections.map((section) => (
            <div key={section.group} className="space-y-1.5">
              <div className="px-3 text-[11px] font-sans font-medium text-[#777A72]">
                {section.group}
              </div>
              <nav className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectTab(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full flex items-center px-3 py-2.5 border-l-2 text-[13px] font-sans text-left transition-colors ${
                        isActive
                          ? 'border-[#253A32] bg-[#F6F3ED] text-[#242823] font-semibold'
                          : 'border-transparent text-[#5F635C] hover:text-[#242823] hover:bg-[#F6F3ED]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-[#253A32]' : 'text-[#777A72]'}`} />
                        <span>{item.label}</span>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
