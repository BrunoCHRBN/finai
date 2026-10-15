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

  const fetchConnectToken = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/pluggy/connect-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao gerar token do Pluggy');
      setConnectToken(data.accessToken);
    } catch (err: any) {
      setError(err.message || 'Erro ao inicializar conexão Open Finance');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSimulateSandboxSync = async () => {
    setIsSyncing(true);
    try {
      // Simulate or trigger sync with a sample connected item ID or real item
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div 
        className="w-full max-w-xl rounded-2xl border border-emerald-500/30 bg-[#0c0f14] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#1e2634] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Pluggy Open Finance Widget</h3>
              <p className="text-[10px] text-slate-400">Conecte sua conta bancária de forma segura</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4 text-xs">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
              <span>Gerando sessão segura com Pluggy Open Finance...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
              <div>
                <div className="font-bold">Falha na inicialização</div>
                <div className="text-[11px] mt-1">{error}</div>
                <button
                  onClick={fetchConnectToken}
                  className="mt-3 px-3 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold"
                >
                  Tentar Novamente
                </button>
              </div>
            </div>
          ) : successItemId ? (
            <div className="py-8 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Conexão Realizada com Sucesso!</h4>
              <p className="text-xs text-slate-300 max-w-sm mx-auto">
                Suas contas e extratos bancários foram sincronizados com sucesso e categorizados localmente pelo motor de regras.
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all"
              >
                Concluir e Ver Dashboard
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#12161f] border border-[#1e2634] space-y-2">
                <div className="text-xs font-semibold text-white flex items-center justify-between">
                  <span>Token de Conexão Gerado</span>
                  <span className="font-mono text-[10px] text-emerald-400">STATUS: PRONTO</span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Sua sessão com o agregador Pluggy está autenticada. Você pode abrir o widget interativo oficial ou testar a sincronização imediata.
                </p>
              </div>

              {/* Pluggy Web Connect URL */}
              {connectToken && (
                <div className="space-y-3">
                  <a
                    href={`https://connect.pluggy.ai/?token=${connectToken}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-emerald-500/20"
                  >
                    <span>Abrir Pluggy Connect (Navegador)</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-[#1e2634]"></div>
                    <span className="flex-shrink mx-4 text-[10px] font-mono text-slate-500 uppercase">ou simule um banco de teste</span>
                    <div className="flex-grow border-t border-[#1e2634]"></div>
                  </div>

                  <button
                    onClick={handleSimulateSandboxSync}
                    disabled={isSyncing}
                    className="w-full py-2.5 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 font-semibold text-xs transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-400' : ''}`} />
                    <span>{isSyncing ? 'Sincronizando extratos...' : 'Sincronizar Contas Sandbox de Teste'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
