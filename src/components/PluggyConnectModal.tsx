'use client';

import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, RefreshCw, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';

interface PluggyConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessSync: (itemId: string) => Promise<void>;
}

export function PluggyConnectModal({ isOpen, onClose, onSuccessSync }: PluggyConnectModalProps) {
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successItemId, setSuccessItemId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessItemId(null);
      fetchConnectToken();
    }
  }, [isOpen]);

  // Listen for Pluggy Connect postMessage events
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Pluggy Connect sends postMessage events on success
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

  const fetchConnectToken = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/pluggy/connect-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // The correct URL parameter expected by connect.pluggy.ai is `connect_token`
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
              <h3 className="text-sm font-bold text-white">Conexão Segura Pluggy Open Finance</h3>
              <p className="text-[10px] text-slate-400">Selecione seu banco para autorizar a leitura de saldo e faturas</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
              <span>Gerando sessão segura com o conector Pluggy...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
              <div>
                <div className="font-bold">Falha de autenticação</div>
                <div className="text-[11px] mt-1">{error}</div>
                <button
                  onClick={fetchConnectToken}
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
              {pluggyConnectUrl && (
                <>
                  {/* Embedded Pluggy Connect Iframe */}
                  <div className="w-full rounded-xl overflow-hidden border border-[#1e2634] bg-white shadow-inner relative">
                    <iframe
                      src={pluggyConnectUrl}
                      title="Pluggy Connect"
                      allow="clipboard-read; clipboard-write"
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
                      <span>Abrir em aba separada</span>
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
