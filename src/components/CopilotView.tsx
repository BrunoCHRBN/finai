'use client';

import React from 'react';
import { 
  Sparkles, 
  Cpu, 
  CheckCircle2, 
  Compass, 
  FileText, 
  AlertCircle 
} from 'lucide-react';
import { FinancialMetrics } from '@/lib/ai/math-engine';

interface CopilotViewProps {
  metrics: FinancialMetrics;
  diagnosis: any;
  onRunDiagnosis: () => void;
  isGenerating: boolean;
}

export function CopilotView({ metrics, diagnosis, onRunDiagnosis, isGenerating }: CopilotViewProps) {

  const maturityLevels = [
    {
      level: 1,
      title: 'Estabilização de Caixa',
      goal: 'Estancar juros passivos e estabelecer um colchão de liquidez imediata de R$ 1.000.',
      milestones: [
        'Caixa líquido inferior a 30 dias de custos essenciais',
        'Eliminação de parcelamentos e encargos de rotativo',
      ],
      badgeColor: 'border-[#F1D3CF] bg-[#FDF2F0] text-[#963F36]',
    },
    {
      level: 2,
      title: 'Construção da Reserva',
      goal: 'Alocar de 3 a 6 meses de despesas fixas em instrumentos com liquidez diária e sustentar taxa de poupança superior a 20%.',
      milestones: [
        'Reserva entre 1 e 5 meses de custo operacional',
        'Despesas fixas mapeadas sem distorções orçamentárias',
        'Zero passivos de alto custo em aberto',
        'Capacidade consistente de poupança mensal',
      ],
      badgeColor: 'border-[#CCE0EE] bg-[#F0F6FA] text-[#27557A]',
    },
    {
      level: 3,
      title: 'Acumulação de Capital',
      goal: 'Aporte regular no início de cada ciclo contábil, distribuído entre títulos indexados à inflação e ativos reais.',
      milestones: [
        'Mais de 6 meses de despesas totalmente cobertas',
        'Aportes de investimentos sistemáticos e automatizados',
      ],
      badgeColor: 'border-[#CCE3D5] bg-[#EDF5F0] text-[#245A3C]',
    },
    {
      level: 4,
      title: 'Preservação & Risco',
      goal: 'Fluxo contínuo de proventos operacionais, foco em imunização inflacionária e estrutura de sucessão patrimonial.',
      milestones: [
        'Rendimento passivo superior ao custo de vida mensal',
        'Gestão de risco de cauda e otimização tributária',
      ],
      badgeColor: 'border-[#E7E1D7] bg-[#F7F4EE] text-[#B29A70]',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Executive Header Banner */}
      <div className="bg-[#FFFFFF] border border-[#E7E1D7] rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono tracking-widest uppercase text-[#B29A70] font-semibold mb-1.5">
            <Compass className="w-3.5 h-3.5" />
            <span>Diagnóstico & Parecer Patrimonial</span>
          </div>
          <h2 className="font-serif text-2xl font-normal text-[#242823] tracking-tight">
            Evolução por Nível de Liquidez & Recomendações
          </h2>
          <p className="text-xs text-[#5F635C] mt-1.5 max-w-2xl leading-relaxed">
            Prioridades financeiras decorrem diretamente da folga de caixa apurada. O que estabiliza uma conta vulnerável difere radicalmente da estratégia recomendada para quem dispõe de reserva operacional plena.
          </p>
        </div>

        <button
          onClick={onRunDiagnosis}
          disabled={isGenerating}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#253A32] hover:bg-[#1C2C26] text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50 shrink-0 cursor-pointer"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
          <span>{isGenerating ? 'Processando Modelagem...' : 'Atualizar Diagnóstico Analítico'}</span>
        </button>
      </div>

      {/* The 4 Maturity Levels Timeline */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#777A72] font-semibold">
            Matriz de Maturidade Financeira (4 Estágios)
          </h3>
          <span className="text-[11px] font-mono text-[#5F635C]">
            Classificação atual: <strong className="text-[#253A32]">Nível {metrics.maturityLevel}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {maturityLevels.map((lvl) => {
            const isCurrent = metrics.maturityLevel === lvl.level;
            const isCompleted = metrics.maturityLevel > lvl.level;

            return (
              <div
                key={lvl.level}
                className={`p-5 rounded-xl border flex flex-col justify-between transition-all relative ${
                  isCurrent
                    ? 'border-[#253A32] bg-[#FAF8F5] shadow-sm ring-1 ring-[#253A32]/20'
                    : isCompleted
                    ? 'border-[#E7E1D7] bg-[#FFFFFF]'
                    : 'border-[#E7E1D7]/70 bg-[#F6F3ED]/40 opacity-70'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${lvl.badgeColor}`}>
                      NÍVEL {lvl.level}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-mono font-bold text-[#245A3C] flex items-center gap-1 bg-[#EDF5F0] px-2 py-0.5 rounded border border-[#CCE3D5]">
                        <CheckCircle2 className="w-3 h-3" /> VOCÊ ESTÁ AQUI
                      </span>
                    )}
                    {isCompleted && (
                      <span className="text-[10px] font-mono font-semibold text-[#5F635C] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-[#245A3C]" /> CONCLUÍDO
                      </span>
                    )}
                  </div>

                  <div className="font-serif text-base font-normal text-[#242823] mb-1.5">{lvl.title}</div>
                  <p className="text-[11px] text-[#5F635C] leading-relaxed mb-4">{lvl.goal}</p>
                </div>

                <div className="pt-3 border-t border-[#E7E1D7] space-y-1.5">
                  {lvl.milestones.map((m, idx) => (
                    <div key={idx} className="text-[10px] text-[#5F635C] flex items-start gap-1.5 leading-snug">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#B29A70] mt-1 shrink-0" />
                      <span>{m}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Advisory Memo / Current Diagnosis Deep Dive */}
      {diagnosis && (
        <div className="bg-[#FFFFFF] border border-[#E7E1D7] rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#E7E1D7] gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#FAF8F5] border border-[#E7E1D7] flex items-center justify-center text-[#253A32]">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-normal text-[#242823]">
                  Parecer Financeiro & Plano Tático
                </h3>
                <p className="text-[11px] text-[#777A72]">
                  Síntese analítica auditada pelo motor determinístico e contextualizada por IA
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-mono text-[#5F635C] bg-[#F0EDE6] px-3 py-1.5 rounded-lg border border-[#E7E1D7] self-start sm:self-auto">
              <Cpu className="w-3.5 h-3.5 text-[#253A32]" />
              <span>Consumo da consulta: <strong className="text-[#242823]">{diagnosis.tokenCount || 215} tokens</strong></span>
            </div>
          </div>

          {/* Headline and Executive Summary */}
          <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E7E1D7] space-y-2">
            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-[#245A3C]">
              {diagnosis.headline}
            </div>
            <p className="text-xs text-[#242823] leading-relaxed">
              {diagnosis.summary}
            </p>
          </div>

          {/* Execution steps */}
          {diagnosis.priorityActions && diagnosis.priorityActions.length > 0 && (
            <div className="space-y-3 pt-1">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#777A72] font-semibold">
                Plano de Ação Sequencial Recomendado
              </div>
              <div className="space-y-2.5">
                {diagnosis.priorityActions.map((action: any, i: number) => (
                  <div 
                    key={i} 
                    className="p-3.5 rounded-xl border border-[#E7E1D7] bg-[#FFFFFF] hover:bg-[#FAF8F5] flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-[#253A32] text-white font-mono font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                        {i + 1}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-[#242823]">{action.title}</div>
                        <div className="text-[11px] text-[#777A72] font-mono">
                          Alocação: <span className="text-[#5F635C]">{action.category}</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-[#245A3C] px-2.5 py-1 rounded bg-[#EDF5F0] border border-[#CCE3D5] self-start sm:self-auto">
                      {action.impact}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Institutional Compliance Disclaimer */}
          <div className="pt-3 border-t border-[#E7E1D7] text-[10px] text-[#777A72] leading-relaxed flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-[#B29A70] shrink-0 mt-0.5" />
            <span>
              Este parecer é gerado estritamente para suporte à tomada de decisão patrimonial com base nos dados consolidados das contas ativas. Não constitui recomendação pública de valores mobiliários nos termos da Instrução CVM nº 20/2021.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
