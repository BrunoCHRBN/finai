'use client';

import React, { useState, useEffect } from 'react';
import { 
  Landmark, 
  CreditCard, 
  RefreshCw, 
  Plus, 
  CheckCircle2, 
  ArrowRight,
  Clock,
  ShieldCheck,
  Database,
  Cpu,
  Radio,
  Sliders,
  Check
} from 'lucide-react';

interface OpenFinanceViewProps {
  accounts: any[];
  isSyncing: boolean;
  onSync: (itemId?: string) => void;
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

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Não realizada';
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const supportedInstitutions = [
    { name: 'C6 Bank', type: 'Conta Corrente & Cartão Carbon' },
    { name: 'Itaú Unibanco', type: 'Conta Corrente & Cartões Click/Personalité' },
    { name: 'Nubank', type: 'Conta Digital & Cartão Ultravioleta' },
    { name: 'Banco Inter', type: 'Conta Digital & Investimentos' },
    { name: 'Bradesco', type: 'Conta Corrente & Cartões' },
    { name: 'Santander Brasil', type: 'Conta Corrente & Cartões' },
    { name: 'XP Investimentos', type: 'Custódia & Plataforma' },
    { name: 'BTG Pactual', type: 'Banking & Investimentos' },
  ];

  const [customItemId, setCustomItemId] = useState('');
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState<number>(60);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [nextScheduledSyncAt, setNextScheduledSyncAt] = useState<string | null>(null);
  const [isSavingInterval, setIsSavingInterval] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Load preferences
  useEffect(() => {
    async function loadPreferences() {
      try {
        const res = await fetch('/api/planning?month=2026-10');
        if (res.ok) {
          const data = await res.json();
          if (data.preferences) {
            setSyncIntervalMinutes(data.preferences.syncIntervalMinutes ?? 60);
            setLastSyncAt(data.preferences.lastSyncAt || null);
            setNextScheduledSyncAt(data.preferences.nextScheduledSyncAt || null);
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar preferências de sincronização:', err);
      }
    }
    loadPreferences();
  }, [isSyncing]);

  const handleSaveInterval = async (interval: number) => {
    setIsSavingInterval(true);
    setSaveSuccessMsg(null);
    try {
      const res = await fetch('/api/planning', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preferences',
          syncIntervalMinutes: interval,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Erro ao salvar cadência (HTTP ${res.status})`);
      }
      setSyncIntervalMinutes(interval);
      if (data?.preferences?.nextScheduledSyncAt !== undefined) {
        setNextScheduledSyncAt(data.preferences.nextScheduledSyncAt);
      }
      setSaveSuccessMsg('Cadência salva com sucesso.');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar cadência de sincronização');
    } finally {
      setIsSavingInterval(false);
    }
  };

  const handleSyncCustomItem = () => {
    if (!customItemId.trim()) return;
    onSync(customItemId.trim());
  };

  const totalBalance = accounts
    .filter((a) => a.type !== 'CREDIT_CARD')
    .reduce((acc, a) => acc + (a.balance || 0), 0);

  const totalCreditDebt = accounts
    .filter((a) => a.type === 'CREDIT_CARD')
    .reduce((acc, a) => acc + (a.balance || 0), 0);

  return (
    <div className="space-y-6">
      {/* 1. Header: Display Title & Quick Action */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-[#E7E1D7]">
        <div>
          <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-[#777A72] mb-1">
            Infraestrutura de Dados & Open Finance Brasil
          </div>
          <h1 className="font-serif text-3xl md:text-4xl text-[#242823] tracking-tight">
            Contas & Conexões Institucionais
          </h1>
          <p className="text-xs font-sans text-[#5F635C] mt-1">
            Gestão de consentimentos, sincronizações inteligentes e canais de atualização com Pluggy API v2.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onSync()}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#E7E1D7] bg-[#FFFFFF] hover:bg-[#F3F1EB] text-xs font-sans font-medium text-[#242823] transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#5F635C] ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Atualizar Todas'}</span>
          </button>

          <button
            onClick={onOpenPluggyConnect}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#253A32] hover:bg-[#1B2B25] text-white text-xs font-sans font-medium transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-white" />
            <span>Conectar Instituição</span>
          </button>
        </div>
      </div>

      {/* 2. Architecture Clarity: 3 Distinct Phases */}
      <div className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#253A32]" />
            <h3 className="font-serif text-sm font-bold text-[#242823]">
              Arquitetura de Sincronização Inteligente em 3 Etapas
            </h3>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#E4EFE6] text-[#245A3C] font-semibold border border-[#D1E2D4]">
            ISOLAMENTO CONTÁBIL ESTRITO
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div className="p-3.5 rounded-md border border-[#E7E1D7] bg-[#F6F3ED] space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#253A32] text-white font-mono text-[11px] flex items-center justify-center font-bold">1</span>
              <span className="text-xs font-bold text-[#242823] font-sans">Conexão & Consentimento</span>
            </div>
            <p className="text-[11px] text-[#5F635C] leading-relaxed">
              O widget Pluggy Connect autentica diretamente com o banco. O FinAI nunca armazena senhas ou dados sensíveis de acesso.
            </p>
          </div>

          <div className="p-3.5 rounded-md border border-[#E7E1D7] bg-[#F6F3ED] space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#253A32] text-white font-mono text-[11px] flex items-center justify-center font-bold">2</span>
              <span className="text-xs font-bold text-[#242823] font-sans">Sincronização & Normalização</span>
            </div>
            <p className="text-[11px] text-[#5F635C] leading-relaxed">
              O conector ingere movimentações com deduplicação por hash, converte sinais contábeis e preserva o saldo de referência bancário.
            </p>
          </div>

          <div className="p-3.5 rounded-md border border-[#E7E1D7] bg-[#F6F3ED] space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#253A32] text-white font-mono text-[11px] flex items-center justify-center font-bold">3</span>
              <span className="text-xs font-bold text-[#242823] font-sans">Recálculo & Conciliação</span>
            </div>
            <p className="text-[11px] text-[#5F635C] leading-relaxed">
              O motor 100% determinístico avalia correspondências entre receitas esperadas e créditos reais, atualizando as projeções prospectivas.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Automation Cadence & Webhook Telemetry */}
      <div className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#253A32]" />
              <h4 className="text-xs font-bold text-[#242823] font-sans uppercase tracking-wider">
                Cadência de Atualização Automática
              </h4>
            </div>
            {saveSuccessMsg && (
              <span className="text-[11px] text-[#245A3C] font-sans font-medium flex items-center gap-1">
                <Check className="w-3 h-3" /> {saveSuccessMsg}
              </span>
            )}
          </div>
          <p className="text-xs text-[#5F635C] font-sans">
            Configure a periodicidade com que o FinAI consulta novos dados bancários das conexões Open Finance ativas.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {[
              { label: 'Manual', val: 0 },
              { label: '30 min', val: 30 },
              { label: '1 hora', val: 60 },
              { label: '6 horas', val: 360 },
              { label: '12 horas', val: 720 },
              { label: '24 horas', val: 1440 },
            ].map((opt) => {
              const isSelected = syncIntervalMinutes === opt.val;
              return (
                <button
                  key={opt.val}
                  type="button"
                  disabled={isSavingInterval}
                  onClick={() => handleSaveInterval(opt.val)}
                  className={`px-3 py-1.5 rounded-md text-xs font-sans transition-colors cursor-pointer border ${
                    isSelected
                      ? 'bg-[#253A32] text-white border-[#253A32] font-semibold'
                      : 'bg-[#F6F3ED] text-[#5F635C] border-[#E7E1D7] hover:border-[#D6CFC2]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-3 text-xs text-[#777A72] font-mono border-t border-[#F0EDE6]">
            <div>Última: <strong className="text-[#242823]">{formatDate(lastSyncAt || undefined)}</strong></div>
            <div>Próxima verificação devida: <strong className="text-[#242823]">{formatDate(nextScheduledSyncAt || undefined)}</strong></div>
          </div>
          <div className="text-[11px] text-[#777A72] font-sans bg-[#FAF8F5] p-2 rounded border border-[#E7E1D7]">
            <strong>Mecanismo de Execução:</strong> A verificação é avaliada sob demanda ao navegar pelas telas ou quando disparada por um agendador externo (cron/CLI). O servidor Next.js local não mantém workers em segundo plano com a interface fechada.
          </div>
        </div>

        <div className="space-y-2.5 border-t md:border-t-0 md:border-l md:border-[#E7E1D7] md:pl-5 pt-3 md:pt-0">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#245A3C]" />
            <h4 className="text-xs font-bold text-[#242823] font-sans uppercase tracking-wider">
              Webhook Oficial de Eventos em Tempo Real
            </h4>
          </div>
          <p className="text-xs text-[#5F635C] font-sans leading-relaxed">
            Notificações instantâneas de novos lançamentos enviadas pela Pluggy diretamente para a API FinAI.
          </p>

          <div className="p-2.5 rounded bg-[#F6F3ED] border border-[#E7E1D7] font-mono text-[11px] text-[#242823] flex items-center justify-between">
            <span>POST /api/pluggy/webhook</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#E4EFE6] text-[#245A3C] font-bold border border-[#D1E2D4]">
              Idempotente (SHA-256)
            </span>
          </div>

          <div className="text-[11px] text-[#777A72] font-sans bg-[#FAF8F5] p-2.5 rounded border border-[#E7E1D7]">
            <strong>Ambiente Local:</strong> Para receber webhooks externos da Pluggy durante desenvolvimento, execute um túnel público (como <code className="font-mono text-[#242823]">ngrok http 3000</code>) ou utilize chamadas locais simuladas.
          </div>
        </div>
      </div>

      {/* 4. Institutional Connection Summary Banner */}
      <div className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="text-[11px] font-sans font-semibold text-[#777A72] uppercase">
            Contas Ativas Reconciliadas
          </div>
          <div className="text-2xl font-serif font-bold text-[#242823] mt-0.5">
            {accounts.length} contas
          </div>
          <div className="text-[11px] text-[#5F635C] font-sans mt-0.5">
            C6 Bank & Itaú conectados
          </div>
        </div>

        <div>
          <div className="text-[11px] font-sans font-semibold text-[#777A72] uppercase">
            Saldo Disponível em Caixa
          </div>
          <div className="text-2xl font-serif font-bold text-[#245A3C] tabular-nums mt-0.5">
            {formatCurrency(totalBalance)}
          </div>
          <div className="text-[11px] text-[#5F635C] font-sans mt-0.5">
            Disponibilidade imediata apurada
          </div>
        </div>

        <div>
          <div className="text-[11px] font-sans font-semibold text-[#777A72] uppercase">
            Faturas Abertas (Crédito)
          </div>
          <div className="text-2xl font-serif font-bold text-[#963F36] tabular-nums mt-0.5">
            {formatCurrency(totalCreditDebt)}
          </div>
          <div className="text-[11px] text-[#5F635C] font-sans mt-0.5">
            Total a liquidar nos cartões
          </div>
        </div>
      </div>

      {/* 5. Meu Pluggy Direct Item ID Sync Box */}
      <div className="p-4 rounded-lg border border-[#E7E1D7] bg-[#F6F3ED] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#242823] font-sans">
              Importação Direta de Conexão Meu Pluggy
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#E4EFE6] text-[#245A3C] font-medium border border-[#D1E2D4]">
              PESSOA FÍSICA
            </span>
          </div>
          <p className="text-xs text-[#5F635C] font-sans max-w-xl">
            Insira o identificador único (<code className="font-mono text-[#242823]">Item ID</code>) gerado pelo portal <strong className="text-[#242823]">meu.pluggy.ai</strong> para acionar a busca imediata de contas e transações.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <input
            type="text"
            value={customItemId}
            onChange={(e) => setCustomItemId(e.target.value)}
            placeholder="Cole o Item ID da conexão..."
            className="px-3 py-1.5 rounded-md bg-[#FFFFFF] border border-[#E7E1D7] text-xs font-mono text-[#242823] placeholder-[#777A72] focus:outline-none focus:border-[#253A32] w-full md:w-72"
          />
          <button
            onClick={handleSyncCustomItem}
            disabled={isSyncing || !customItemId.trim()}
            className="px-3.5 py-1.5 rounded-md bg-[#253A32] hover:bg-[#1B2B25] text-white font-medium text-xs font-sans transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
          >
            {isSyncing ? 'Sincronizando...' : 'Puxar Dados'}
          </button>
        </div>
      </div>

      {/* 6. Active Accounts Ledger */}
      <div className="rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E7E1D7] bg-[#F6F3ED] flex items-center justify-between text-[11px] font-sans font-semibold tracking-wider text-[#777A72] uppercase">
          <span>Contas e Cartões em Operação ({accounts.length})</span>
          <span className="text-[10px] text-[#245A3C] font-mono">Conectado via API v2</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans border-collapse">
            <thead>
              <tr className="border-b border-[#E7E1D7] text-[#777A72] text-[11px] font-semibold uppercase">
                <th className="py-2.5 px-4">Instituição / Conta</th>
                <th className="py-2.5 px-4 w-40">Tipo de Ativo</th>
                <th className="py-2.5 px-4 w-48">Última Sincronização</th>
                <th className="py-2.5 px-4 w-32">Status</th>
                <th className="py-2.5 px-4 w-40 text-right">Saldo Apurado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E1D7]">
              {accounts.map((acc) => {
                const isCard = acc.type === 'CREDIT_CARD';
                return (
                  <tr key={acc.id} className="hover:bg-[#F3F1EB] transition-colors">
                    {/* Account Name */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded bg-[#F0EDE6] text-[#253A32]">
                          {isCard ? <CreditCard className="w-4 h-4" /> : <Landmark className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="font-semibold text-[#242823]">{acc.name}</div>
                          <div className="text-[11px] text-[#777A72] font-mono">
                            {acc.pluggyItemId ? `Item: ${acc.pluggyItemId.slice(0, 16)}...` : 'Conta Interna'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Account Type */}
                    <td className="py-3 px-4 text-[#5F635C]">
                      {isCard ? 'Cartão de Crédito' : acc.type === 'INVESTMENT' ? 'Custódia & Investimentos' : 'Conta Corrente'}
                    </td>

                    {/* Sync Date */}
                    <td className="py-3 px-4 font-mono text-[#5F635C] text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#777A72]" />
                        <span>{formatDate(acc.updatedAt)}</span>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-sans font-medium bg-[#E4EFE6] text-[#245A3C] border border-[#D1E2D4]">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Reconciliado</span>
                      </span>
                    </td>

                    {/* Balance */}
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                      <span className={isCard ? 'text-[#963F36]' : 'text-[#245A3C]'}>
                        {formatCurrency(acc.balance)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. Supported Connectors in Open Finance Catalog */}
      <div className="p-5 rounded-lg border border-[#E7E1D7] bg-[#FFFFFF] shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-serif text-base text-[#242823] font-bold">
              Catálogo de Conectores Suportados (Open Finance)
            </h3>
            <p className="text-xs text-[#5F635C] font-sans">
              Instituições financeiras integradas e disponíveis para autorização imediata via Pluggy.
            </p>
          </div>
          <button
            onClick={onOpenPluggyConnect}
            className="text-xs font-sans font-medium text-[#253A32] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Ver todas as instituições</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          {supportedInstitutions.map((c, i) => (
            <div
              key={i}
              onClick={onOpenPluggyConnect}
              className="p-3 rounded-md border border-[#E7E1D7] bg-[#F6F3ED] hover:border-[#D6CFC2] hover:bg-[#F0EDE6] transition-colors cursor-pointer flex items-center justify-between group"
            >
              <div>
                <div className="text-xs font-semibold text-[#242823] font-sans group-hover:text-[#253A32]">
                  {c.name}
                </div>
                <div className="text-[11px] text-[#777A72] font-sans mt-0.5">{c.type}</div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-[#777A72] group-hover:text-[#242823] transition-colors" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
