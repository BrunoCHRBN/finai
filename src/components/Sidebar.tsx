'use client';

import React from 'react';
import { 
  LayoutDashboard, 
  PieChart, 
  Receipt, 
  Landmark, 
  Sparkles, 
  Zap, 
  ShieldCheck, 
  Command,
  ChevronRight
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  maturityLevel: number;
  tokenCount: number;
}

export function Sidebar({ currentTab, onSelectTab, maturityLevel, tokenCount }: SidebarProps) {
  const navItems = [
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'budgets', label: 'Orçamentos & Custos', icon: PieChart },
    { id: 'transactions', label: 'Extrato & Transações', icon: Receipt },
    { id: 'openfinance', label: 'Open Finance (Pluggy)', icon: Landmark },
    { id: 'copilot', label: 'Copiloto & Nível', icon: Sparkles },
  ];

  const levelNames: Record<number, { name: string; color: string; desc: string }> = {
    1: { name: 'Nível 1: Estabilização', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', desc: 'Colchão mínimo de R$ 1.000 e corte de rotativo' },
    2: { name: 'Nível 2: Base Concluída', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', desc: 'Reserva de 6 meses; taxa de poupança acima de 20%' },
    3: { name: 'Nível 3: Acumulador', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', desc: 'Aportes regulares sem perder para a inflação' },
    4: { name: 'Nível 4: Investidor', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20', desc: 'Patrimônio gerando renda; foco em risco e custo' },
  };

  const levelInfo = levelNames[maturityLevel] || levelNames[2];

  return (
    <aside className="w-64 border-r border-[#1e2634] bg-[#0c0f14] flex flex-col justify-between shrink-0 select-none">
      <div>
        {/* Brand Header */}
        <div className="h-16 border-b border-[#1e2634] px-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                FinAI <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono font-medium border border-emerald-500/30">DESKTOP</span>
              </div>
              <div className="text-[11px] text-slate-400">Controle de Caixa & Patrimônio</div>
            </div>
          </div>
        </div>

        {/* User Maturity Level Card */}
        <div className="p-3.5 mx-3 mt-3 rounded-xl border border-[#1e2634] bg-[#12161f]">
          <div className="text-[10px] uppercase font-mono text-slate-400 tracking-wider mb-1.5 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            Maturidade Atual
          </div>
          <div className={`text-xs font-semibold px-2 py-1 rounded-md border ${levelInfo.color} mb-1 inline-block`}>
            {levelInfo.name}
          </div>
          <div className="text-[11px] text-slate-400">{levelInfo.desc}</div>
        </div>

        {/* Navigation Menu */}
        <nav className="p-3 space-y-1">
          <div className="text-[10px] uppercase font-mono text-slate-500 px-3 py-1 font-semibold tracking-wider">
            Navegação
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Info & Token Efficiency Meter */}
      <div className="p-3 border-t border-[#1e2634] space-y-3">
        {/* Token Efficiency Meter */}
        <div className="p-2.5 rounded-lg bg-[#12161f] border border-[#1e2634] text-xs">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-slate-400 font-medium">Chamada LLM</span>
            <span className="text-emerald-400 font-mono font-medium">Apenas raciocínio</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mb-1.5 overflow-hidden">
            <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '12%' }} />
          </div>
          <div className="text-[10px] text-slate-400 flex items-center justify-between font-mono">
            <span>Última consulta:</span>
            <span className="text-slate-200">{tokenCount > 0 ? `${tokenCount} tokens` : '0 tokens'}</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1 leading-tight">
            Contas somadas no TypeScript local; a IA não faz aritmética.
          </div>
        </div>

        {/* Keyboard shortcut hint */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-mono">
          <span className="flex items-center gap-1">
            <Command className="w-3 h-3" /> + K
          </span>
          <span className="text-[10px] text-slate-500">Paleta de comandos</span>
        </div>
      </div>
    </aside>
  );
}
