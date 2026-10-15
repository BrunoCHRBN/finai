'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  RefreshCw, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle,
  Building2,
  Sparkles
} from 'lucide-react';

interface PluggyConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessSync: (itemId: string) => Promise<void>;
}

export function PluggyConnectModal({ isOpen, onClose, onSuccessSync }: PluggyConnectModalProps) {
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<'meupluggy' | 'all'>('meupluggy');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successItemId, setSuccessItemId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessItemId(null);
      fetchConnectToken(activeMode === 'meupluggy' ? 200 : undefined);
    }
  }, [isOpen, activeMode]);

  // Listen for Pluggy Connect postMessage events
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (
          payload?.event === 'item/created' ||
          payload?.type === 'SUCCESS' ||
          payload?.item?.id ||
          payload?.data?.item?.id
        ) {
          const itemId = payload?.item?.id || payload?.data?.item?.id;
          if (itemId) {
            setIsSyncing(true);
            try {
              await onSuccessSync(itemId);
              setSuccessItemId(itemId);
            } catch (err: any) {
              setError(err.message || 'Falha ao sincronizar a conta conectada');
            } finally {
              setIsSyncing(false);
            }
          }
        }
      } catch {
        // Ignore unrelated postMessage events
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSuccessSync]);

  const fetchConnectToken = async (connectorId?: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/pluggy/connect-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connectorId ? { connectorId } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao gerar o token de conexão com a Pluggy');
      setConnectToken(data.accessToken);
    } catch (err: any) {
      setError(err.message || 'Erro ao inicializar sessão Open Finance');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenPopup = () => {
    if (!pluggyConnectUrl) return;
    const width = 520;
    const height = 750;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    window.open(
      pluggyConnectUrl,
      'pluggy_connect_popup',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );
  };

  const handleSimulateSandboxSync = async () => {
    setIsSyncing(true);
    try {
      const simulatedItemId = `item-pluggy-${Date.now()}`;
      await onSuccessSync(simulatedItemId);
      setSuccessItemId(simulatedItemId);
    } catch (err: any) {
      setError(err.message || 'Erro ao sincronizar');
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isOpen) return null;

  const pluggyConnectUrl = connectToken
    ? `https://connect.pluggy.ai/?connect_token=${encodeURIComponent(connectToken)}&includeSandbox=true`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div 
        className="w-full max-w-2xl rounded-2xl border border-emerald-500/30 bg-[#0c0f14] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#1e2634] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Conexão Open Finance via Pluggy</h3>
              <p className="text-[10px] text-slate-400">Ponte segura e leitura de extratos autorizada</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex border-b border-[#1e2634] bg-[#090c10] px-4 pt-2 gap-2">
          <button
            onClick={() => setActiveMode('meupluggy')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-lg transition-all border-b-2 ${
              activeMode === 'meupluggy'
                ? 'border-blue-500 text-blue-400 bg-[#101622]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Meu Pluggy (Caixa e Bancos Reais)</span>
          </button>

          <button
            onClick={() => setActiveMode('all')}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-t-lg transition-all border-b-2 ${
              activeMode === 'all'
                ? 'border-emerald-500 text-emerald-400 bg-[#0f1915]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sandbox Pluggy Bank</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
              <span>Inicializando sessão segura com a Pluggy...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
              <div>
                <div className="font-bold">Falha de autenticação</div>
                <div className="text-[11px] mt-1">{error}</div>
                <button
                  onClick={() => fetchConnectToken(activeMode === 'meupluggy' ? 200 : undefined)}
                  className="mt-3 px-3 py-1.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold"
                >
                  Tentar Novamente
                </button>
              </div>
            </div>
          ) : successItemId ? (
            <div className="py-10 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Instituição Conectada com Sucesso</h4>
              <p className="text-xs text-slate-300 max-w-sm mx-auto">
                As contas e os lançamentos foram importados e categorizados pelas regras locais.
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/20"
              >
                Voltar ao Painel
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeMode === 'meupluggy' ? (
                <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-xs text-slate-300 space-y-2">
                  <div className="flex items-center justify-between text-blue-300 font-semibold">
                    <span>Autorização via Conector Meu Pluggy</span>
                    <span className="font-mono text-[10px] bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-500/30">
                      PESSOA FÍSICA GRATUITA
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Faça login com a sua conta do <strong>meu.pluggy.ai</strong> na janela abaixo e selecione a sua conexão da Caixa. Essa autorização atua como ponte segura para o FinAI puxar os saldos e transações.
                  </p>
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      onClick={handleOpenPopup}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir Conexão em Janela Separada</span>
                    </button>
                    <span className="text-[10px] text-slate-400">Recomendado caso o login no Meu Pluggy bloqueie iframe</span>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs">
                  <div className="flex items-center justify-between text-amber-300 font-semibold mb-1">
                    <span>Ambiente Sandbox (Modo de Testes)</span>
                    <span className="font-mono text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                      CREDENCIAIS DE TESTE
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    Para testar sem dados reais, busque por <strong className="text-white">Pluggy Bank</strong> e use usuário <code className="text-amber-300 font-mono">user-ok</code> e senha <code className="text-amber-300 font-mono">password-ok</code>.
                  </p>
                </div>
              )}

              {pluggyConnectUrl && (
                <>
                  {/* Embedded Pluggy Connect Iframe */}
                  <div className="w-full rounded-xl overflow-hidden border border-[#1e2634] bg-white shadow-inner relative">
                    <iframe
                      src={pluggyConnectUrl}
                      title="Pluggy Connect"
                      allow="clipboard-read; clipboard-write; popups"
                      className="w-full h-[480px] border-none"
                    />
                  </div>

                  {/* External tab fallback & sandbox simulation */}
                  <div className="flex items-center justify-between pt-2">
                    <a
                      href={pluggyConnectUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-slate-400 hover:text-emerald-400 flex items-center gap-1 font-mono transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir link direto</span>
                    </a>

                    <button
                      onClick={handleSimulateSandboxSync}
                      disabled={isSyncing}
                      className="text-[11px] text-slate-400 hover:text-slate-200 underline underline-offset-4"
                    >
                      {isSyncing ? 'Sincronizando...' : 'Simular conexão de teste'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
