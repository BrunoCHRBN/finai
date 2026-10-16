'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  CreditCard,
  TrendingUp,
  Plus,
  ShieldCheck,
  AlertTriangle,
  Trash2,
  Calendar,
  Layers,
  Camera,
  CheckCircle2,
  FileText
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

  const solvencyBadges = {
    EXCELLENT: { label: 'Excelente Solvência', surface: 'bg-[#E4EFE6] border-[#D1E2D4] text-[#245A3C]' },
    HEALTHY: { label: 'Balanço Saudável', surface: 'bg-[#E4EFE6] border-[#D1E2D4] text-[#245A3C]' },
    LEVERAGED: { label: 'Alavancagem Elevada', surface: 'bg-[#F5EEDB] border-[#E8DEC7] text-[#795C24]' },
    DEFICIT: { label: 'Déficit Patrimonial', surface: 'bg-[#F8E8E5] border-[#EED0CC] text-[#963F36]' },
  };

  const currentSolvency = solvencyBadges[summary.solvencyStatus] || solvencyBadges.HEALTHY;

  return (
    <div className="space-y-6 font-sans">
      {/* 1. Header: Wealth Management Editorial Display */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-[#E7E1D7]">
        <div>
          <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-[#777A72] mb-1">
            Balanço Patrimonial & Alocação de Ativos
          </div>
          <h1 className="font-serif text-3xl md:text-4xl text-[#242823] tracking-tight">
            Consolidação Patrimonial
          </h1>
          <p className="text-xs font-sans text-[#5F635C] mt-1">
            Demonstração integrada de ativos líquidos, bens imobilizados, dívidas bancárias e patrimônio líquido auditado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {feedbackMsg && (
            <div className={`px-3 py-1.5 rounded-md text-xs font-medium border ${feedbackMsg.type === 'success' ? 'bg-[#E4EFE6] border-[#D1E2D4] text-[#245A3C]' : 'bg-[#F8E8E5] border-[#EED0CC] text-[#963F36]'}`}>
              {feedbackMsg.text}
            </div>
          )}

          <button
            onClick={handleRecordSnapshot}
            disabled={isRecordingSnapshot}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#D6CFC2] bg-[#FFFFFF] hover:bg-[#F3F1EB] text-xs font-medium text-[#242823] transition-colors disabled:opacity-50"
            title="Gravar foto do balanço patrimonial para histórico"
          >
            <Camera className="w-3.5 h-3.5 text-[#5F635C]" />
            <span>{isRecordingSnapshot ? 'Gravando...' : 'Gravar Snapshot'}</span>
          </button>

          <button
            onClick={onOpenNewLiabilityModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#E7E1D7] bg-[#FFFFFF] hover:bg-[#F3F1EB] text-xs font-medium text-[#963F36] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Dívida / Passivo</span>
          </button>

          <button
            onClick={onOpenNewAssetModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#253A32] hover:bg-[#1C2C26] text-xs font-semibold text-white shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Ativo Manual</span>
          </button>
        </div>
      </div>

      {/* 2. Primary KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Net Worth Hero Card */}
        <div className="p-6 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#5F635C] mb-2 font-sans">
              <span>Patrimônio Líquido Consolidado</span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-medium border ${currentSolvency.surface}`}>
                {currentSolvency.label}
              </span>
            </div>

            <div className={`font-serif text-3xl md:text-4xl tabular-nums font-bold tracking-tight mt-1 ${summary.netWorth >= 0 ? 'text-[#242823]' : 'text-[#963F36]'}`}>
              {formatCurrency(summary.netWorth)}
            </div>

            <div className="text-[11px] text-[#5F635C] font-sans mt-2 leading-relaxed">
              Ativos Totais ({formatCurrency(summary.totalAssets)}) menos Passivos Exigíveis ({formatCurrency(summary.totalLiabilities)}).
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-[#E7E1D7] flex items-center justify-between text-xs text-[#777A72]">
            <span>Índice de Alavancagem</span>
            <span className="font-mono font-semibold text-[#242823]">{summary.debtToAssetRatioPct}% dos ativos</span>
          </div>
        </div>

        {/* Total Assets Card */}
        <div className="p-6 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#5F635C] mb-2 font-sans">
              <span className="text-[#245A3C] font-semibold">Total de Ativos</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#E4EFE6] text-[#245A3C] border border-[#D1E2D4]">
                {summary.assetsList.length} itens
              </span>
            </div>

            <div className="font-serif text-3xl md:text-4xl text-[#242823] tabular-nums font-bold tracking-tight mt-1">
              {formatCurrency(summary.totalAssets)}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4 text-[11px] font-sans text-[#5F635C]">
              <div>
                <span className="text-[#777A72] block">Caixa & Bancos:</span>
                <span className="font-mono font-medium text-[#242823]">{formatCurrency(summary.liquidAssets)}</span>
              </div>
              <div>
                <span className="text-[#777A72] block">Investimentos:</span>
                <span className="font-mono font-medium text-[#242823]">{formatCurrency(summary.investedAssets)}</span>
              </div>
              <div className="col-span-2 pt-1 border-t border-[#F0EDE6]">
                <span className="text-[#777A72]">Bens Reais & Imobilizado: </span>
                <span className="font-mono font-medium text-[#242823]">{formatCurrency(summary.fixedAssets)}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-[#E7E1D7] flex items-center justify-between text-xs text-[#777A72]">
            <span>Liquidez Imediata</span>
            <span className="font-mono font-semibold text-[#253A32]">{summary.allocation.liquidPct}%</span>
          </div>
        </div>

        {/* Total Liabilities Card */}
        <div className="p-6 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#5F635C] mb-2 font-sans">
              <span className="text-[#963F36] font-semibold">Total de Passivos & Dívidas</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#F8E8E5] text-[#963F36] border border-[#EED0CC]">
                {summary.liabilitiesList.length} obrigações
              </span>
            </div>

            <div className="font-serif text-3xl md:text-4xl text-[#963F36] tabular-nums font-bold tracking-tight mt-1">
              {formatCurrency(summary.totalLiabilities)}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4 text-[11px] font-sans text-[#5F635C]">
              <div>
                <span className="text-[#777A72] block">Cartões & Curto Prazo:</span>
                <span className="font-mono font-medium text-[#242823]">{formatCurrency(summary.shortTermLiabilities)}</span>
              </div>
              <div>
                <span className="text-[#777A72] block">Financiamentos/Longo:</span>
                <span className="font-mono font-medium text-[#242823]">{formatCurrency(summary.longTermLiabilities)}</span>
              </div>
              <div className="col-span-2 pt-1 border-t border-[#F0EDE6]">
                <span className="text-[#777A72]">Controle: </span>
                <span className="text-[#242823]">Zero juros de atraso</span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-[#E7E1D7] flex items-center justify-between text-xs text-[#777A72]">
            <span>Passivos Circulantes</span>
            <span className="font-mono font-semibold text-[#963F36]">{formatCurrency(summary.shortTermLiabilities)}</span>
          </div>
        </div>
      </div>

      {/* 3. Asset Composition Bar & Category Breakdown */}
      <div className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-4">
        <div className="flex items-center justify-between">
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
        <div className="flex flex-wrap gap-3 pt-2">
          {summary.composition.map((item, idx) => {
            const colors = ['bg-[#253A32]', 'bg-[#4B6B5D]', 'bg-[#795C24]', 'bg-[#B29A70]', 'bg-[#94A3B8]'];
            const dotColor = colors[idx % colors.length];
            return (
              <div key={item.category} className="flex items-center gap-2 text-xs font-sans">
                <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                <span className="text-[#5F635C]">{item.label}:</span>
                <span className="font-mono font-semibold text-[#242823]">{formatCurrency(item.total)} ({item.percentageOfAssets}%)</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Tab Navigation: View Switcher */}
      <div className="flex items-center justify-between border-b border-[#E7E1D7] pb-px">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'ALL'
                ? 'border-[#253A32] text-[#253A32] font-semibold'
                : 'border-transparent text-[#777A72] hover:text-[#242823]'
            }`}
          >
            Visão Geral Integrada
          </button>
          <button
            onClick={() => setActiveTab('ASSETS')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'ASSETS'
                ? 'border-[#253A32] text-[#253A32] font-semibold'
                : 'border-transparent text-[#777A72] hover:text-[#242823]'
            }`}
          >
            Ativos ({summary.assetsList.length})
          </button>
          <button
            onClick={() => setActiveTab('LIABILITIES')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'LIABILITIES'
                ? 'border-[#253A32] text-[#253A32] font-semibold'
                : 'border-transparent text-[#777A72] hover:text-[#242823]'
            }`}
          >
            Passivos & Dívidas ({summary.liabilitiesList.length})
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'HISTORY'
                ? 'border-[#253A32] text-[#253A32] font-semibold'
                : 'border-transparent text-[#777A72] hover:text-[#242823]'
            }`}
          >
            Evolução Histórica ({snapshots.length} fotos)
          </button>
        </div>
      </div>

      {/* 5. Tab Content */}
      {/* 5A. Assets Table */}
      {(activeTab === 'ALL' || activeTab === 'ASSETS') && (
        <div className="rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] overflow-hidden shadow-xs">
          <div className="px-5 py-3.5 border-b border-[#E7E1D7] bg-[#FDFCFB] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#245A3C]" />
              <h4 className="font-serif text-sm font-bold text-[#242823]">Ativos Patrimoniais Reconhecidos</h4>
            </div>
            <button
              onClick={onOpenNewAssetModal}
              className="text-xs text-[#253A32] font-semibold hover:underline flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar Ativo
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
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
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#F0EDE6] text-[#5F635C] border border-[#E7E1D7]">
                        {asset.category}
                      </span>
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
          </div>
        </div>
      )}

      {/* 5B. Liabilities Table */}
      {(activeTab === 'ALL' || activeTab === 'LIABILITIES') && (
        <div className="rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] overflow-hidden shadow-xs">
          <div className="px-5 py-3.5 border-b border-[#E7E1D7] bg-[#FDFCFB] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#963F36]" />
              <h4 className="font-serif text-sm font-bold text-[#242823]">Passivos & Dívidas Exigíveis</h4>
            </div>
            <button
              onClick={onOpenNewLiabilityModal}
              className="text-xs text-[#963F36] font-semibold hover:underline flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar Dívida
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
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
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#F8E8E5] text-[#963F36] border border-[#EED0CC]">
                        {liab.category}
                      </span>
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
          </div>
        </div>
      )}

      {/* 5C. Historical Evolution (Only when real data exists) */}
      {activeTab === 'HISTORY' && (
        <div className="rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E7E1D7]">
            <div>
              <h4 className="font-serif text-base font-bold text-[#242823]">Evolução Patrimonial Determinística</h4>
              <p className="text-xs text-[#5F635C]">
                Histórico gerado exclusivamente a partir de fechamentos auditados (sem inferências fictícias).
              </p>
            </div>
            <button
              onClick={handleRecordSnapshot}
              disabled={isRecordingSnapshot}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#253A32] text-white text-xs font-semibold hover:bg-[#1C2C26] transition-colors disabled:opacity-50"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Registrar Fechamento Atual</span>
            </button>
          </div>

          {snapshots.length >= 2 ? (
            <div className="h-64 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
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
            <div className="p-8 text-center text-xs text-[#5F635C] bg-[#FDFCFB] border border-[#E7E1D7] rounded-md space-y-2">
              <Calendar className="w-6 h-6 mx-auto text-[#777A72]" />
              <div className="font-semibold text-[#242823]">Histórico em Formação</div>
              <p className="max-w-md mx-auto text-[11px] leading-relaxed">
                O gráfico de evolução temporal requer no mínimo dois fechamentos mensais gravados.
                Clique em <strong>&ldquo;Registrar Fechamento Atual&rdquo;</strong> para gravar o primeiro ponto de referência do mês atual.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
