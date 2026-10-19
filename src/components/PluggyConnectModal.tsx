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

  const fetchConnectToken = React.useCallback(async (connectorId?: number) => {
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao inicializar sessão Open Finance';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessItemId(null);
      fetchConnectToken(activeMode === 'meupluggy' ? 200 : undefined);
    }
  }, [isOpen, activeMode, fetchConnectToken]);

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
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Falha ao sincronizar a conta conectada';
              setError(msg);
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
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#242823]/40 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl my-auto rounded-xl border border-[#E7E1D7] bg-[#FFFFFF] shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#E7E1D7] flex items-center justify-between bg-[#FAF8F5]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FFFFFF] border border-[#E7E1D7] text-[#253A32] flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#242823]">
                Conexão Open Finance via Pluggy API
              </h3>
              <p className="text-[10px] text-[#777A72] font-mono">
                Ponte segura de leitura para extratos institucionais
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-md text-[#777A72] hover:text-[#242823] hover:bg-[#E7E1D7]/50 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex border-b border-[#E7E1D7] bg-[#FAF8F5] px-4 pt-2 gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveMode('meupluggy')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-all border-b-2 cursor-pointer ${
              activeMode === 'meupluggy'
                ? 'border-[#253A32] text-[#253A32] bg-[#FFFFFF] shadow-xs'
                : 'border-transparent text-[#5F635C] hover:text-[#242823]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Meu Pluggy (Conexões Reais)</span>
          </button>

          <button
            onClick={() => setActiveMode('all')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-all border-b-2 cursor-pointer ${
              activeMode === 'all'
                ? 'border-[#253A32] text-[#253A32] bg-[#FFFFFF] shadow-xs'
                : 'border-transparent text-[#5F635C] hover:text-[#242823]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sandbox Pluggy Bank</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-[#777A72] gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-[#253A32]" />
              <span className="font-mono text-xs">Inicializando sessão segura com a Pluggy...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl border border-[#F1D3CF] bg-[#FDF2F0] text-[#963F36] flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-[#963F36] mt-0.5" />
              <div>
                <div className="font-semibold text-xs">Falha de autenticação</div>
                <div className="text-[11px] mt-1">{error}</div>
                <button
                  onClick={() => fetchConnectToken(activeMode === 'meupluggy' ? 200 : undefined)}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-[#963F36] text-white text-xs font-semibold hover:bg-[#7d342d] transition-all cursor-pointer"
                >
                  Tentar Novamente
                </button>
              </div>
            </div>
          ) : successItemId ? (
            <div className="py-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#EDF5F0] border border-[#CCE3D5] text-[#245A3C] flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="font-serif text-lg font-normal text-[#242823]">
                Instituição Conectada com Sucesso
              </h4>
              <p className="text-xs text-[#5F635C] max-w-sm mx-auto leading-relaxed">
                As contas e os lançamentos foram importados e categorizados pelas regras do motor local.
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-5 py-2.5 rounded-lg bg-[#253A32] hover:bg-[#1C2C26] text-white font-semibold text-xs transition-all shadow-sm cursor-pointer"
              >
                Retornar ao Painel
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeMode === 'meupluggy' ? (
                <div className="p-3.5 rounded-xl border border-[#CCE0EE] bg-[#F0F6FA] text-xs text-[#27557A] space-y-2">
                  <div className="flex items-center justify-between font-semibold">
                    <span>Autorização via Conector Meu Pluggy</span>
                    <span className="font-mono text-[10px] bg-[#FFFFFF] px-2 py-0.5 rounded border border-[#CCE0EE]">
                      CONECTOR 200
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[#27557A]/90">
                    Faça login com sua conta do <strong>meu.pluggy.ai</strong> na janela abaixo e selecione a instituição bancária. Essa conexão estabelece a ponte de leitura segura para atualização de extratos.
                  </p>
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      onClick={handleOpenPopup}
                      className="px-3.5 py-1.5 rounded-lg bg-[#27557A] hover:bg-[#1f4361] text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir Conexão em Janela Separada</span>
                    </button>
                    <span className="text-[10px] text-[#5F635C]">Recomendado se o navegador restringir iframes</span>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl border border-[#F6E0B8] bg-[#FEF7ED] text-xs text-[#9C6A28] space-y-1.5">
                  <div className="flex items-center justify-between font-semibold">
                    <span>Ambiente Sandbox (Modo de Testes)</span>
                    <span className="font-mono text-[10px] bg-[#FFFFFF] px-2 py-0.5 rounded border border-[#F6E0B8]">
                      CREDENCIAIS DE TESTE
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[#9C6A28]/90">
                    Para testes isolados, pesquise por <strong>Pluggy Bank</strong> e utilize o usuário <code className="font-mono font-bold bg-[#FFFFFF] px-1 py-0.5 rounded">user-ok</code> e senha <code className="font-mono font-bold bg-[#FFFFFF] px-1 py-0.5 rounded">password-ok</code>.
                  </p>
                </div>
              )}

              {pluggyConnectUrl && (
                <>
                  {/* Embedded Pluggy Connect Iframe */}
                  <div className="w-full rounded-xl overflow-hidden border border-[#E7E1D7] bg-[#FFFFFF] shadow-sm relative">
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
                      className="text-[11px] text-[#5F635C] hover:text-[#253A32] flex items-center gap-1 font-mono transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir link de autenticação direto</span>
                    </a>

                    <button
                      onClick={handleSimulateSandboxSync}
                      disabled={isSyncing}
                      className="text-[11px] text-[#777A72] hover:text-[#242823] underline underline-offset-4 cursor-pointer"
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
