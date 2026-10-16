'use client';

import React, { useState } from 'react';
import { X, Building2, CreditCard, DollarSign, Calendar, Tag, ShieldCheck } from 'lucide-react';

interface NewPatrimonialItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemCreated: () => void;
  initialType?: 'ASSET' | 'LIABILITY';
}

export function NewPatrimonialItemModal({
  isOpen,
  onClose,
  onItemCreated,
  initialType = 'ASSET',
}: NewPatrimonialItemModalProps) {
  const [itemType, setItemType] = useState<'ASSET' | 'LIABILITY'>(initialType);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [value, setValue] = useState('');
  const [creditor, setCreditor] = useState('');
  const [monthlyPayment, setMonthlyPayment] = useState('');
  const [installmentsRemaining, setInstallmentsRemaining] = useState('');
  const [liquidity, setLiquidity] = useState('MEDIUM');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Por favor, informe a descrição ou nome do item.');
      return;
    }

    const numericValue = parseFloat(value.replace(',', '.'));
    if (isNaN(numericValue) || numericValue < 0) {
      setError('Por favor, informe um valor monetário válido maior ou igual a zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (itemType === 'ASSET') {
        const payload = {
          name: name.trim(),
          category: category || 'REAL_ESTATE',
          currentValue: numericValue,
          liquidity,
          notes: notes.trim() || null,
        };
        const res = await fetch('/api/patrimony/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Falha ao salvar ativo');
        }
      } else {
        const payload = {
          name: name.trim(),
          category: category || 'REAL_ESTATE_MORTGAGE',
          currentBalance: numericValue,
          creditor: creditor.trim() || null,
          monthlyPayment: monthlyPayment ? parseFloat(monthlyPayment.replace(',', '.')) : null,
          installmentsRemaining: installmentsRemaining ? parseInt(installmentsRemaining, 10) : null,
          notes: notes.trim() || null,
        };
        const res = await fetch('/api/patrimony/liabilities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Falha ao salvar passivo');
        }
      }

      onItemCreated();
      onClose();
      // Reset form
      setName('');
      setValue('');
      setCreditor('');
      setMonthlyPayment('');
      setInstallmentsRemaining('');
      setNotes('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao cadastrar registro';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs font-sans">
      <div className="bg-[#FFFFFF] border border-[#E7E1D7] rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#E7E1D7] flex items-center justify-between bg-[#FDFCFB]">
          <div>
            <div className="text-[10px] font-sans font-semibold uppercase tracking-wider text-[#777A72]">
              Registro Patrimonial Manual
            </div>
            <h2 className="font-serif text-lg font-bold text-[#242823]">
              {itemType === 'ASSET' ? 'Novo Ativo Patrimonial' : 'Nova Obrigação / Passivo'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#777A72] hover:text-[#242823] hover:bg-[#F0EDE6] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 text-xs bg-[#F8E8E5] border border-[#EED0CC] text-[#963F36] rounded-md">
              {error}
            </div>
          )}

          {/* Type Toggle: Asset vs Liability */}
          <div>
            <label className="block text-xs font-medium text-[#5F635C] mb-1.5">Natureza do Registro</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setItemType('ASSET');
                  setCategory('REAL_ESTATE');
                }}
                className={`py-2 px-3 text-xs rounded-md border font-medium flex items-center justify-center gap-2 transition-colors ${
                  itemType === 'ASSET'
                    ? 'bg-[#E4EFE6] border-[#D1E2D4] text-[#245A3C] font-semibold'
                    : 'bg-[#FFFFFF] border-[#E7E1D7] text-[#5F635C] hover:bg-[#F9F8F6]'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Ativo (Bem / Aplicação)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setItemType('LIABILITY');
                  setCategory('REAL_ESTATE_MORTGAGE');
                }}
                className={`py-2 px-3 text-xs rounded-md border font-medium flex items-center justify-center gap-2 transition-colors ${
                  itemType === 'LIABILITY'
                    ? 'bg-[#F8E8E5] border-[#EED0CC] text-[#963F36] font-semibold'
                    : 'bg-[#FFFFFF] border-[#E7E1D7] text-[#5F635C] hover:bg-[#F9F8F6]'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Passivo (Dívida / Financiamento)</span>
              </button>
            </div>
          </div>

          {/* Name / Description */}
          <div>
            <label className="block text-xs font-medium text-[#5F635C] mb-1">
              {itemType === 'ASSET' ? 'Identificação do Ativo' : 'Identificação da Dívida / Financiamento'}
            </label>
            <input
              type="text"
              required
              placeholder={itemType === 'ASSET' ? 'Ex: Apartamento Jardins, Honda Civic 2023, Cripto Privada' : 'Ex: Financiamento Imobiliário Caixa, Empréstimo Auto Santander'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#E7E1D7] rounded-md focus:outline-hidden focus:border-[#253A32] bg-[#FFFFFF] text-[#242823]"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-[#5F635C] mb-1">Categoria Contábil</label>
            {itemType === 'ASSET' ? (
              <select
                value={category || 'REAL_ESTATE'}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#E7E1D7] rounded-md focus:outline-hidden focus:border-[#253A32] bg-[#FFFFFF] text-[#242823]"
              >
                <option value="REAL_ESTATE">Imóveis & Propriedades (Real Estate)</option>
                <option value="VEHICLE">Veículos & Automóveis</option>
                <option value="INVESTMENT">Investimentos & Previdência Privada Externa</option>
                <option value="EQUITY">Participações Societárias & Empresas</option>
                <option value="VALUABLE">Bens de Alto Valor (Joias, Obras, Ouro)</option>
                <option value="CASH">Dinheiro em Espécie / Carteira Física</option>
                <option value="OTHER">Outros Ativos</option>
              </select>
            ) : (
              <select
                value={category || 'REAL_ESTATE_MORTGAGE'}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#E7E1D7] rounded-md focus:outline-hidden focus:border-[#253A32] bg-[#FFFFFF] text-[#242823]"
              >
                <option value="REAL_ESTATE_MORTGAGE">Financiamento Imobiliário (Hipoteca/SFH)</option>
                <option value="VEHICLE_FINANCING">Financiamento de Veículo</option>
                <option value="PERSONAL_LOAN">Empréstimo Pessoal</option>
                <option value="PAYROLL_LOAN">Crédito Consignado</option>
                <option value="TAX_DEBT">Dívida Fiscal / Tributária</option>
                <option value="OTHER">Outras Obrigações e Dívidas</option>
              </select>
            )}
          </div>

          {/* Monetary Value */}
          <div>
            <label className="block text-xs font-medium text-[#5F635C] mb-1">
              {itemType === 'ASSET' ? 'Valor Atual Avaliado (R$)' : 'Saldo Devedor Atual a Pagar (R$)'}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-xs text-[#777A72]">R$</span>
              <input
                type="text"
                required
                placeholder="0,00"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-[#E7E1D7] rounded-md focus:outline-hidden focus:border-[#253A32] bg-[#FFFFFF] text-[#242823] font-mono tabular-nums"
              />
            </div>
          </div>

          {/* Asset Specific: Liquidity */}
          {itemType === 'ASSET' && (
            <div>
              <label className="block text-xs font-medium text-[#5F635C] mb-1">Perfil de Liquidez</label>
              <select
                value={liquidity}
                onChange={(e) => setLiquidity(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#E7E1D7] rounded-md focus:outline-hidden focus:border-[#253A32] bg-[#FFFFFF] text-[#242823]"
              >
                <option value="IMMEDIATE">Imediata (D+0 / D+1)</option>
                <option value="SHORT_TERM">Curto Prazo (D+2 a D+30)</option>
                <option value="MEDIUM">Médio Prazo (1 a 6 meses)</option>
                <option value="ILLIQUID">Ilíquido (Imóveis, veículos, empresas)</option>
              </select>
            </div>
          )}

          {/* Liability Specific: Creditor & Installment */}
          {itemType === 'LIABILITY' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#5F635C] mb-1">Instituição Credora</label>
                <input
                  type="text"
                  placeholder="Ex: Caixa, Santander, Bradesco"
                  value={creditor}
                  onChange={(e) => setCreditor(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E7E1D7] rounded-md focus:outline-hidden focus:border-[#253A32] bg-[#FFFFFF] text-[#242823]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5F635C] mb-1">Valor da Parcela Mensal (R$)</label>
                <input
                  type="text"
                  placeholder="Ex: 1.850,00"
                  value={monthlyPayment}
                  onChange={(e) => setMonthlyPayment(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E7E1D7] rounded-md focus:outline-hidden focus:border-[#253A32] bg-[#FFFFFF] text-[#242823] font-mono"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-[#5F635C] mb-1">Parcelas Restantes (meses)</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Ex: 180"
                  value={installmentsRemaining}
                  onChange={(e) => setInstallmentsRemaining(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E7E1D7] rounded-md focus:outline-hidden focus:border-[#253A32] bg-[#FFFFFF] text-[#242823] font-mono"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-[#5F635C] mb-1">Observações Contábeis (Opcional)</label>
            <textarea
              rows={2}
              placeholder="Detalhes adicionais, número de matrícula, certidão ou dados contratuais..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#E7E1D7] rounded-md focus:outline-hidden focus:border-[#253A32] bg-[#FFFFFF] text-[#242823]"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-[#E7E1D7] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-[#5F635C] hover:text-[#242823] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#253A32] hover:bg-[#1C2C26] rounded-md transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar no Balanço'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
