'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  CreditCard,
  Plus,
  ShieldCheck,
  Trash2,
  Calendar,
  Layers,
  Camera,
  CheckCircle2,
  FileText,
  Wallet,
  Info,
} from 'lucide-react';
import {
  PatrimonialSummary,
  PatrimonialItem
} from '@/lib/patrimony-engine';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { PageHeader } from './ui/PageHeader';
import { MetricCard } from './ui/MetricCard';
import { StatusBadge } from './ui/StatusBadge';
import { FinancialDataTable } from './ui/FinancialDataTable';
import { EmptyState } from './ui/EmptyState';

interface PatrimonyViewProps {
  onOpenNewAssetModal: () => void;
  onOpenNewLiabilityModal: () => void;
}

export function PatrimonyView({
  onOpenNewAssetModal,
  onOpenNewLiabilityModal,
}: PatrimonyViewProps) {
  const [summary, setSummary] = useState<PatrimonialSummary | null>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'ASSETS' | 'LIABILITIES' | 'HISTORY'>('ALL');
  const [isRecordingSnapshot, setIsRecordingSnapshot] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const loadPatrimonialData = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/patrimony');
      if (!res.ok) throw new Error('Falha ao consultar dados patrimoniais');
      const data = await res.json();
      setSummary(data.summary);
      setSnapshots(data.snapshots || []);
    } catch (err) {
      console.error('Error fetching patrimony:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPatrimonialData();
  }, []);

  const handleDeleteItem = async (item: PatrimonialItem) => {
    if (item.dataSource === 'OPEN_FINANCE') {
      alert('Contas sincronizadas via Open Finance são gerenciadas na aba Contas & Open Finance.');
      return;
    }

    const confirmDelete = window.confirm(`Deseja realmente remover o registro "${item.name}"?`);
    if (!confirmDelete) return;

    try {
      const endpoint = item.itemType === 'ASSET' ? `/api/patrimony/assets/${item.id}` : `/api/patrimony/liabilities/${item.id}`;
      const res = await fetch(endpoint, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao remover item');
      
      setFeedbackMsg({ text: 'Registro removido com sucesso.', type: 'success' });
      setTimeout(() => setFeedbackMsg(null), 3500);
      await loadPatrimonialData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao remover';
      setFeedbackMsg({ text: msg, type: 'error' });
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  const handleRecordSnapshot = async () => {
    setIsRecordingSnapshot(true);
    try {
      const res = await fetch('/api/patrimony/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Falha ao gravar snapshot');
      setFeedbackMsg({ text: 'Snapshot patrimonial do mês registrado com sucesso.', type: 'success' });
      setTimeout(() => setFeedbackMsg(null), 3500);
      await loadPatrimonialData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao gravar snapshot';
      setFeedbackMsg({ text: msg, type: 'error' });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } finally {
      setIsRecordingSnapshot(false);
    }
  };

  if (isLoading || !summary) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-xs text-[#5F635C] gap-3">
        <div className="w-6 h-6 border-2 border-[#253A32] border-t-transparent rounded-full animate-spin" />
        <span>Consolidando ativos, contas e passivos patrimoniais...</span>
      </div>
    );
  }

  const solvencyStatusMap: Record<string, { label: string; status: 'success' | 'info' | 'warning' | 'danger' }> = {
    EXCELLENT: { label: 'Excelente Solvência', status: 'success' },
    HEALTHY: { label: 'Balanço Saudável', status: 'info' },
    LEVERAGED: { label: 'Alavancagem Elevada', status: 'warning' },
    DEFICIT: { label: 'Déficit Patrimonial', status: 'danger' },
  };

  const currentSolvency = solvencyStatusMap[summary.solvencyStatus] || { label: 'Balanço Saudável', status: 'info' };

  return (
    <div className="space-y-6">
      {/* 1. Header with PageHeader and Non-overlapping Actions */}
      <PageHeader
        kicker="Balanço Patrimonial & Alocação"
        title="Consolidação Patrimonial"
        description="Demonstração integrada de ativos líquidos, bens imobilizados, dívidas bancárias e patrimônio líquido auditado."
        badge={
          <StatusBadge status={currentSolvency.status}>
            {currentSolvency.label}
          </StatusBadge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {feedbackMsg && (
              <span
                className={`px-3 py-1.5 rounded-md text-xs font-medium border ${
                  feedbackMsg.type === 'success'
                    ? 'bg-[#E4EFE6] border-[#D1E2D4] text-[#245A3C]'
                    : 'bg-[#F8E8E5] border-[#EED0CC] text-[#963F36]'
                }`}
              >
                {feedbackMsg.text}
              </span>
            )}

            <button
              onClick={handleRecordSnapshot}
              disabled={isRecordingSnapshot}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#D6CFC2] bg-[#FFFFFF] hover:bg-[#F3F1EB] text-xs font-medium text-[#242823] transition-colors disabled:opacity-50 min-h-[38px]"
              title="Gravar foto do balanço patrimonial para histórico auditado"
            >
              <Camera className="w-3.5 h-3.5 text-[#5F635C]" />
              <span>{isRecordingSnapshot ? 'Gravando...' : 'Gravar Snapshot'}</span>
            </button>

            <button
              onClick={onOpenNewLiabilityModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#E7E1D7] bg-[#FFFFFF] hover:bg-[#F3F1EB] text-xs font-medium text-[#963F36] transition-colors min-h-[38px]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Passivo / Dívida</span>
            </button>

            <button
              onClick={onOpenNewAssetModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#253A32] hover:bg-[#1C2C26] text-xs font-semibold text-white shadow-xs transition-colors min-h-[38px]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Ativo Manual</span>
            </button>
          </div>
        }
      />

      {/* 2. Primary KPI Cards Grid: Explicit Separation Between Solvency & Immediate Liquidity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Patrimônio Líquido (Solvência Estrutural) */}
        <MetricCard
          label="Patrimônio Líquido"
          value={formatCurrency(summary.netWorth)}
          badge={
            <StatusBadge status={currentSolvency.status}>
              {currentSolvency.label}
            </StatusBadge>
          }
          tone={summary.netWorth >= 0 ? 'brand' : 'danger'}
          footer={
            <div className="flex items-center justify-between text-xs text-[#5F635C]">
              <span>Alavancagem sobre ativos:</span>
              <span className="font-mono font-medium text-[#242823]">{summary.debtToAssetRatioPct}%</span>
            </div>
          }
        />

        {/* KPI 2: Liquidez Imediata (Recursos prontamente resgatáveis) */}
        <MetricCard
          label="Liquidez Imediata"
          value={formatCurrency(summary.liquidAssets)}
          badge={
            <StatusBadge status={summary.liquidAssets > 0 ? 'success' : 'warning'}>
              {summary.allocation.liquidPct}% da base
            </StatusBadge>
          }
          tone="default"
          footer={
            <div className="flex items-center gap-1.5 text-[11px] text-[#5F635C]">
              <Wallet className="w-3.5 h-3.5 text-[#253A32] shrink-0" />
              <span className="truncate">Caixa, contas e reservas de pronto resgate</span>
            </div>
          }
        />

        {/* KPI 3: Ativos Totais (Líquidos + Investidos + Imobilizados) */}
        <MetricCard
          label="Ativos Totais"
          value={formatCurrency(summary.totalAssets)}
          badge={
            <StatusBadge status="neutral">
              {summary.assetsList.length} itens
            </StatusBadge>
          }
          tone="default"
          footer={
            <div className="space-y-0.5 text-[11px] text-[#5F635C]">
              <div className="flex justify-between">
                <span>Investimentos:</span>
                <span className="font-mono font-medium text-[#242823]">{formatCurrency(summary.investedAssets)}</span>
              </div>
              <div className="flex justify-between">
                <span>Imobilizados:</span>
                <span className="font-mono font-medium text-[#242823]">{formatCurrency(summary.fixedAssets)}</span>
              </div>
            </div>
          }
        />

        {/* KPI 4: Passivos & Obrigações Exigíveis */}
        <MetricCard
          label="Passivos & Obrigações"
          value={formatCurrency(summary.totalLiabilities)}
          badge={
            <StatusBadge status={summary.totalLiabilities === 0 ? 'success' : 'warning'}>
              {summary.liabilitiesList.length} obrigações
            </StatusBadge>
          }
          tone={summary.totalLiabilities > 0 ? 'danger' : 'default'}
          footer={
            <div className="space-y-0.5 text-[11px] text-[#5F635C]">
              <div className="flex justify-between">
                <span>Curto Prazo:</span>
                <span className="font-mono font-medium text-[#242823]">{formatCurrency(summary.shortTermLiabilities)}</span>
              </div>
              <div className="flex justify-between">
                <span>Longo Prazo:</span>
                <span className="font-mono font-medium text-[#242823]">{formatCurrency(summary.longTermLiabilities)}</span>
              </div>
            </div>
          }
        />
      </div>

      {/* 3. Asset Composition Bar & Category Breakdown */}
      <div className="p-4 sm:p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#253A32]" />
            <h3 className="font-serif text-sm font-bold text-[#242823]">Alocação & Composição de Ativos</h3>
          </div>
          <span className="text-[11px] text-[#777A72] font-mono">100% da base patrimonial auditada</span>
        </div>

        {/* Proportional Stack Bar */}
        <div className="w-full h-3.5 bg-[#F0EDE6] rounded-md overflow-hidden flex">
          {summary.composition.map((item, idx) => {
            const colors = ['bg-[#253A32]', 'bg-[#4B6B5D]', 'bg-[#795C24]', 'bg-[#B29A70]', 'bg-[#94A3B8]'];
            const barColor = colors[idx % colors.length];
            if (item.percentageOfAssets <= 0) return null;
            return (
              <div
                key={item.category}
                style={{ width: `${item.percentageOfAssets}%` }}
                className={`${barColor} h-full transition-all`}
                title={`${item.label}: ${item.percentageOfAssets}% (${formatCurrency(item.total)})`}
              />
            );
          })}
        </div>

        {/* Legend Badges */}
        <div className="flex flex-wrap gap-3 pt-1">
          {summary.composition.map((item, idx) => {
            const colors = ['bg-[#253A32]', 'bg-[#4B6B5D]', 'bg-[#795C24]', 'bg-[#B29A70]', 'bg-[#94A3B8]'];
            const dotColor = colors[idx % colors.length];
            return (
              <div key={item.category} className="flex items-center gap-2 text-xs font-sans">
                <span className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`} />
                <span className="text-[#5F635C]">{item.label}:</span>
                <span className="font-mono font-semibold text-[#242823]">
                  {formatCurrency(item.total)} ({item.percentageOfAssets}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Tab Navigation with Contained Mobile Horizontal Scroll */}
      <div className="flex items-center border-b border-[#E7E1D7] overflow-x-auto no-scrollbar gap-2">
        <button
          onClick={() => setActiveTab('ALL')}
          className={`px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'ALL'
              ? 'border-[#253A32] text-[#253A32] font-semibold'
              : 'border-transparent text-[#777A72] hover:text-[#242823]'
          }`}
        >
          Visão Geral Integrada
        </button>
        <button
          onClick={() => setActiveTab('ASSETS')}
          className={`px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'ASSETS'
              ? 'border-[#253A32] text-[#253A32] font-semibold'
              : 'border-transparent text-[#777A72] hover:text-[#242823]'
          }`}
        >
          Ativos ({summary.assetsList.length})
        </button>
        <button
          onClick={() => setActiveTab('LIABILITIES')}
          className={`px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'LIABILITIES'
              ? 'border-[#253A32] text-[#253A32] font-semibold'
              : 'border-transparent text-[#777A72] hover:text-[#242823]'
          }`}
        >
          Passivos & Dívidas ({summary.liabilitiesList.length})
        </button>
        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'HISTORY'
              ? 'border-[#253A32] text-[#253A32] font-semibold'
              : 'border-transparent text-[#777A72] hover:text-[#242823]'
          }`}
        >
          Evolução Histórica ({snapshots.length} fotos)
        </button>
      </div>

      {/* 5. Tab Content */}
      {/* 5A. Assets Table */}
      {(activeTab === 'ALL' || activeTab === 'ASSETS') && (
        <FinancialDataTable
          title="Ativos Patrimoniais Reconhecidos"
          description="Contas correntes, aplicações financeiras, bens imobilizados e participações."
          action={
            <button
              onClick={onOpenNewAssetModal}
              className="text-xs text-[#253A32] font-semibold hover:underline flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar Ativo
            </button>
          }
        >
          <table className="w-full text-left border-collapse text-xs min-w-[600px]">
            <thead>
              <tr className="border-b border-[#E7E1D7] text-[#777A72] font-semibold bg-[#F9F8F6]">
                <th className="py-2.5 px-4">Identificação</th>
                <th className="py-2.5 px-4">Classe Contábil</th>
                <th className="py-2.5 px-4">Origem dos Dados</th>
                <th className="py-2.5 px-4">Data Ref.</th>
                <th className="py-2.5 px-4 text-right">Valor Atual</th>
                <th className="py-2.5 px-4 text-center w-16">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E1D7]">
              {summary.assetsList.map((asset) => (
                <tr key={asset.id} className="hover:bg-[#FDFCFB] transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-medium text-[#242823]">{asset.name}</div>
                    {asset.institutionOrCreditor && (
                      <div className="text-[11px] text-[#777A72]">{asset.institutionOrCreditor}</div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status="neutral">
                      {asset.category}
                    </StatusBadge>
                  </td>
                  <td className="py-3 px-4">
                    {asset.dataSource === 'OPEN_FINANCE' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#E4EFE6] text-[#245A3C] border border-[#D1E2D4]">
                        <ShieldCheck className="w-3 h-3" /> Open Finance
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#F0EDE6] text-[#5F635C] border border-[#E7E1D7]">
                        <FileText className="w-3 h-3" /> Manual
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-[#777A72]">{asset.referenceDate}</td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-[#242823]">
                    {formatCurrency(asset.value)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {asset.dataSource === 'MANUAL' && (
                      <button
                        onClick={() => handleDeleteItem(asset)}
                        className="p-1 text-[#777A72] hover:text-[#963F36] transition-colors"
                        title="Remover ativo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {summary.assetsList.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[#777A72]">
                    Nenhum ativo cadastrado até o momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </FinancialDataTable>
      )}

      {/* 5B. Liabilities Table */}
      {(activeTab === 'ALL' || activeTab === 'LIABILITIES') && (
        <FinancialDataTable
          title="Passivos & Dívidas Exigíveis"
          description="Saldos devedores de cartões, empréstimos, financiamentos e compromissos futuros."
          action={
            <button
              onClick={onOpenNewLiabilityModal}
              className="text-xs text-[#963F36] font-semibold hover:underline flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar Dívida
            </button>
          }
        >
          <table className="w-full text-left border-collapse text-xs min-w-[600px]">
            <thead>
              <tr className="border-b border-[#E7E1D7] text-[#777A72] font-semibold bg-[#F9F8F6]">
                <th className="py-2.5 px-4">Identificação / Credor</th>
                <th className="py-2.5 px-4">Categoria</th>
                <th className="py-2.5 px-4">Origem</th>
                <th className="py-2.5 px-4">Data Ref.</th>
                <th className="py-2.5 px-4 text-right">Saldo Devedor</th>
                <th className="py-2.5 px-4 text-center w-16">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E1D7]">
              {summary.liabilitiesList.map((liab) => (
                <tr key={liab.id} className="hover:bg-[#FDFCFB] transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-medium text-[#242823]">{liab.name}</div>
                    {liab.institutionOrCreditor && (
                      <div className="text-[11px] text-[#777A72]">{liab.institutionOrCreditor}</div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status="danger">
                      {liab.category}
                    </StatusBadge>
                  </td>
                  <td className="py-3 px-4">
                    {liab.dataSource === 'OPEN_FINANCE' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#E4EFE6] text-[#245A3C] border border-[#D1E2D4]">
                        <ShieldCheck className="w-3 h-3" /> Open Finance
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#F0EDE6] text-[#5F635C] border border-[#E7E1D7]">
                        <FileText className="w-3 h-3" /> Manual
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-[#777A72]">{liab.referenceDate}</td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-[#963F36]">
                    {formatCurrency(liab.value)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {liab.dataSource === 'MANUAL' && (
                      <button
                        onClick={() => handleDeleteItem(liab)}
                        className="p-1 text-[#777A72] hover:text-[#963F36] transition-colors"
                        title="Remover passivo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {summary.liabilitiesList.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-[#245A3C] bg-[#FDFCFB]">
                    <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-[#245A3C]" />
                    Nenhum passivo ou dívida em aberto. Balanço 100% desonerado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </FinancialDataTable>
      )}

      {/* 5C. Historical Evolution (Deterministic snapshots) */}
      {activeTab === 'HISTORY' && (
        <div className="rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E7E1D7]">
            <div>
              <h4 className="font-serif text-base font-bold text-[#242823]">Evolução Patrimonial Determinística</h4>
              <p className="text-xs text-[#5F635C]">
                Histórico gerado exclusivamente a partir de fechamentos auditados (sem inferências fictícias).
              </p>
            </div>
            <button
              onClick={handleRecordSnapshot}
              disabled={isRecordingSnapshot}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-[#253A32] text-white text-xs font-semibold hover:bg-[#1C2C26] transition-colors disabled:opacity-50 min-h-[38px]"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Registrar Fechamento Atual</span>
            </button>
          </div>

          {snapshots.length >= 2 ? (
            <div className="h-64 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={snapshots}>
                  <defs>
                    <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#253A32" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#253A32" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE6" />
                  <XAxis dataKey="month" stroke="#777A72" fontSize={11} tickLine={false} />
                  <YAxis stroke="#777A72" fontSize={11} tickLine={false} tickFormatter={(val) => `R$ ${val}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E7E1D7', borderRadius: '6px', fontSize: '11px' }}
                    formatter={(val: unknown) => [formatCurrency(Number(val)), '']}
                  />
                  <Area type="monotone" dataKey="netWorth" stroke="#253A32" strokeWidth={2} fillOpacity={1} fill="url(#netWorthGrad)" name="Patrimônio Líquido" />
                  <Area type="monotone" dataKey="totalAssets" stroke="#4B6B5D" strokeWidth={1.5} fillOpacity={0} name="Ativos Totais" />
                  <Area type="monotone" dataKey="totalLiabilities" stroke="#963F36" strokeWidth={1.5} fillOpacity={0} name="Passivos Totais" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={Calendar}
              title="Histórico em Formação"
              description="O gráfico de evolução temporal requer no mínimo dois fechamentos mensais gravados. Clique no botão acima para registrar o primeiro ponto de referência do mês atual."
            />
          )}
        </div>
      )}
    </div>
  );
}
