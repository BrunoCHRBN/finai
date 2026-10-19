import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCashFlowProjection,
  type PlanningAccountInput,
  type ReconciledPlanningTransaction,
  type RecurringFlowInput,
  type RecurringOccurrenceInput,
} from '../src/lib/planning-engine.ts';
import {
  evaluateReconciliation,
  unapplyReconciliation,
  type RecurringOccurrenceModel,
  type RecurringFlowModel,
  type TransactionForReconciliation,
} from '../src/lib/recurring-engine.ts';

describe('Sprint 7 — Integridade Contábil dos 4 Estados (Realizado, Previsto, Confirmado, Projetado)', () => {
  const baseAccounts: PlanningAccountInput[] = [
    { id: 'acc-checking', name: 'Conta Corrente', type: 'CHECKING', balance: 5000 },
    { id: 'acc-savings', name: 'Reserva Emergência', type: 'SAVINGS', balance: 3000 },
    { id: 'acc-card', name: 'Cartão de Crédito', type: 'CREDIT_CARD', balance: 1200 },
  ];

  it('1. Invariante 1: Receita Prevista (Previsto) NUNCA inflaciona o saldo bancário ou saldo líquido inicial', () => {
    const recurringFlows: RecurringFlowInput[] = [
      {
        id: 'flow-salario',
        type: 'INCOME',
        nature: 'CONFIRMED',
        amount: 10000,
        frequency: 'MONTHLY',
        startMonth: '2026-10',
        isActive: 1,
      },
      {
        id: 'flow-freela',
        type: 'INCOME',
        nature: 'ESTIMATED',
        amount: 4500,
        frequency: 'MONTHLY',
        startMonth: '2026-10',
        isActive: 1,
      },
    ];

    const occurrences: RecurringOccurrenceInput[] = [
      {
        id: 'occ-salario-out',
        flowId: 'flow-salario',
        expectedDate: '2026-10-05',
        expectedAmount: 10000,
        status: 'PENDING',
      },
      {
        id: 'occ-freela-out',
        flowId: 'flow-freela',
        expectedDate: '2026-10-20',
        expectedAmount: 4500,
        status: 'PENDING',
      },
    ];

    const result = calculateCashFlowProjection({
      referenceMonth: '2026-10',
      accounts: baseAccounts,
      reconciledTransactions: [],
      recurringFlows,
      liabilities: [],
      goals: [],
      occurrences,
      todayDate: '2026-10-01',
    });

    // Saldo líquido inicial deve ser estritamente 5000 (checking) + 3000 (savings) = 8000
    // O cartão de crédito (1200) e as receitas previstas (10000 + 4500 = 14500) NÃO entram no saldo inicial
    assert.strictEqual(result.initialLiquidBalance, 8000, 'Saldo inicial deve ser 8000');
    assert.strictEqual(result.months[0].openingLiquidBalance, 8000);
    assert.strictEqual(result.months[0].realized.inflows, 0, 'Inflows realizados devem ser 0 antes da liquidação');

    // Indicadores mostram expectativa mas não afetam caixa realizado
    assert.strictEqual(result.indicators.realizedIncomePeriod, 0);
    assert.strictEqual(result.indicators.expectedIncomePeriod, 14500);
    assert.strictEqual(result.indicators.activeRecurringIncome, 14500);
  });

  it('2. Invariante 2: Conciliação de ocorrência vincula transação real sem criar lançamentos fantasmas ou duplicar receita', () => {
    // Cenário: Transação real de crédito entra na conta corrente (+10000)
    // Ocorrência de R$ 10000 é conciliada com a transação
    const realTx: ReconciledPlanningTransaction = {
      id: 'tx-salario-oct',
      accountId: 'acc-checking',
      amount: 10000,
      date: '2026-10-05',
      type: 'CREDIT',
      status: 'SETTLED',
      description: 'FOLHA PAGAMENTO EMPRESA',
      isIgnored: 0,
      normalizedAmount: 10000,
      canonicalType: 'CREDIT',
      isOperatingFlow: true,
    };

    // Atualiza saldo da conta para refletir a entrada real
    const updatedAccounts: PlanningAccountInput[] = [
      { id: 'acc-checking', name: 'Conta Corrente', type: 'CHECKING', balance: 15000 }, // 5000 + 10000
      { id: 'acc-savings', name: 'Reserva Emergência', type: 'SAVINGS', balance: 3000 },
      { id: 'acc-card', name: 'Cartão de Crédito', type: 'CREDIT_CARD', balance: 1200 },
    ];

    const reconciledOccurrences: RecurringOccurrenceInput[] = [
      {
        id: 'occ-salario-out',
        flowId: 'flow-salario',
        expectedDate: '2026-10-05',
        expectedAmount: 10000,
        status: 'RECONCILED',
        transactionId: 'tx-salario-oct',
        reconciledAmount: 10000,
        reconciledAt: '2026-10-05T12:00:00Z',
      },
    ];

    const result = calculateCashFlowProjection({
      referenceMonth: '2026-10',
      accounts: updatedAccounts,
      reconciledTransactions: [realTx],
      recurringFlows: [
        {
          id: 'flow-salario',
          type: 'INCOME',
          nature: 'CONFIRMED',
          amount: 10000,
          frequency: 'MONTHLY',
          startMonth: '2026-10',
          isActive: 1,
        },
      ],
      liabilities: [],
      goals: [],
      occurrences: reconciledOccurrences,
      todayDate: '2026-10-06',
    });

    // 1. Saldo inicial líquido reflete contas reais (15000 + 3000 = 18000)
    assert.strictEqual(result.initialLiquidBalance, 18000);

    // 2. Mês 0 (outubro) registra exatamente 10000 de inflows realizados
    assert.strictEqual(result.months[0].realized.inflows, 10000);

    // 3. Mês 0 NÃO soma os 10000 previstos/confirmados novamente (previne contagem dupla)
    assert.strictEqual(result.months[0].confirmed.recurringInflows, 0);

    // 4. Saldo projetado de fechamento do mês 0 é idêntico ao saldo real acumulado
    assert.strictEqual(result.months[0].closingTotalProjectedBalance, 18000);

    // 5. Variância expectativa vs realizado é 0 (10000 realizado - 10000 esperado)
    assert.strictEqual(result.indicators.varianceExpectationVsRealized, 0);
  });

  it('3. Invariante 3: Transferências internas e pagamentos de fatura são neutros e NUNCA conciliam receita', () => {
    const flow: RecurringFlowModel = {
      id: 'flow-salario',
      title: 'Salário',
      type: 'INCOME',
      nature: 'CONFIRMED',
      amount: 5000,
      frequency: 'MONTHLY',
      startDate: '2026-10-05',
      destinationAccountId: 'acc-checking',
    };

    const occ: RecurringOccurrenceModel = {
      id: 'occ-1',
      flowId: 'flow-salario',
      expectedDate: '2026-10-05',
      expectedAmount: 5000,
      status: 'PENDING',
    };

    // A. Transferência entre contas próprias
    const transferTx: TransactionForReconciliation[] = [
      {
        id: 'tx-transf',
        accountId: 'acc-checking',
        amount: 5000,
        date: '2026-10-05',
        description: 'TRANSFERENCIA ENTRE CONTAS PROPRIAS',
        type: 'TRANSFER',
        isIgnored: 0,
      },
    ];

    const matchTransfer = evaluateReconciliation(occ, flow, transferTx);
    assert.strictEqual(matchTransfer.bestMatch, null, 'Transferência NUNCA deve ser compatível com ocorrência de receita');
    assert.strictEqual(matchTransfer.candidates.length, 0);

    // B. Pagamento de fatura de cartão
    const invoiceTx: TransactionForReconciliation[] = [
      {
        id: 'tx-fatura',
        accountId: 'acc-checking',
        amount: 5000,
        date: '2026-10-05',
        description: 'PAGAMENTO DE FATURA CARTAO NUBANK',
        type: 'CREDIT',
        isIgnored: 0,
      },
    ];

    const matchInvoice = evaluateReconciliation(occ, flow, invoiceTx);
    assert.strictEqual(matchInvoice.bestMatch, null, 'Pagamento de fatura NUNCA deve ser compatível com ocorrência de receita');

    // C. Transação ignorada (is_ignored = 1)
    const ignoredTx: TransactionForReconciliation[] = [
      {
        id: 'tx-ignored',
        accountId: 'acc-checking',
        amount: 5000,
        date: '2026-10-05',
        description: 'SALARIO XYZ',
        type: 'CREDIT',
        isIgnored: 1,
      },
    ];

    const matchIgnored = evaluateReconciliation(occ, flow, ignoredTx);
    assert.strictEqual(matchIgnored.bestMatch, null, 'Transação ignorada NUNCA deve ser conciliada');
  });

  it('4. Invariante 4: Horizontes de projeção (30, 60, 90 dias) acumulam fluxos futuros com integridade estrita', () => {
    // Início: Saldo R$ 10.000
    // Fluxo Recorrente de Receita Confirmada: R$ 8.000 / mês
    // Fluxo Recorrente de Despesa Confirmada: R$ 5.000 / mês
    // Saldo Líquido mensal projetado: +R$ 3.000 / mês
    const accounts: PlanningAccountInput[] = [
      { id: 'acc-chk', name: 'Conta Principal', type: 'CHECKING', balance: 10000 },
    ];

    const flows: RecurringFlowInput[] = [
      {
        id: 'flow-rec',
        type: 'INCOME',
        nature: 'CONFIRMED',
        amount: 8000,
        frequency: 'MONTHLY',
        startMonth: '2026-10',
        isActive: 1,
      },
      {
        id: 'flow-desp',
        type: 'EXPENSE',
        nature: 'CONFIRMED',
        amount: 5000,
        frequency: 'MONTHLY',
        startMonth: '2026-10',
        isActive: 1,
      },
    ];

    const result = calculateCashFlowProjection({
      referenceMonth: '2026-10',
      horizonMonths: 3,
      accounts,
      reconciledTransactions: [],
      recurringFlows: flows,
      liabilities: [],
      goals: [],
      todayDate: '2026-10-01',
    });

    const { days30, days60, days90 } = result.horizonSummaries;

    // 30 dias (mês 1: Novembro)
    assert.strictEqual(days30.days, 30);
    assert.strictEqual(days30.projectedInflows, 8000);
    assert.strictEqual(days30.projectedOutflows, 5000);
    assert.strictEqual(days30.projectedNet, 3000);
    assert.strictEqual(days30.projectedClosingBalance, 13000);
    assert.strictEqual(days30.lowestProjectedBalance, 10000);
    assert.strictEqual(days30.isNegativeLiquidity, false);

    // 60 dias (mês 1 + mês 2: Dezembro)
    assert.strictEqual(days60.days, 60);
    assert.strictEqual(days60.projectedInflows, 16000);
    assert.strictEqual(days60.projectedOutflows, 10000);
    assert.strictEqual(days60.projectedNet, 6000);
    assert.strictEqual(days60.projectedClosingBalance, 16000);
    assert.strictEqual(days60.lowestProjectedBalance, 10000);
    assert.strictEqual(days60.isNegativeLiquidity, false);

    // 90 dias (mês 1 + mês 2 + mês 3: Janeiro)
    assert.strictEqual(days90.days, 90);
    assert.strictEqual(days90.projectedInflows, 24000);
    assert.strictEqual(days90.projectedOutflows, 15000);
    assert.strictEqual(days90.projectedNet, 9000);
    assert.strictEqual(days90.projectedClosingBalance, 19000);
    assert.strictEqual(days90.lowestProjectedBalance, 10000);
    assert.strictEqual(days90.isNegativeLiquidity, false);
  });

  it('5. Invariante 5: Todos os 8 indicadores de projeção calculam deterministicamente com precisão de centavos', () => {
    const accounts: PlanningAccountInput[] = [
      { id: 'acc-1', name: 'Conta A', type: 'CHECKING', balance: 4000 },
    ];

    const flows: RecurringFlowInput[] = [
      {
        id: 'flow-inc-1',
        type: 'INCOME',
        nature: 'CONFIRMED',
        amount: 6000.55,
        frequency: 'MONTHLY',
        startMonth: '2026-10',
        isActive: 1,
      },
      {
        id: 'flow-exp-1',
        type: 'EXPENSE',
        nature: 'CONFIRMED',
        amount: 2500.25,
        frequency: 'MONTHLY',
        startMonth: '2026-10',
        isActive: 1,
      },
    ];

    // Ocorrências com atraso
    const occurrences: RecurringOccurrenceInput[] = [
      {
        id: 'occ-overdue-1',
        flowId: 'flow-inc-1',
        expectedDate: '2026-10-05',
        expectedAmount: 3000.25,
        status: 'OVERDUE',
      },
      {
        id: 'occ-pending-future',
        flowId: 'flow-inc-1',
        expectedDate: '2026-10-25',
        expectedAmount: 3000.30,
        status: 'PENDING',
      },
      {
        id: 'occ-exp',
        flowId: 'flow-exp-1',
        expectedDate: '2026-10-15',
        expectedAmount: 2500.25,
        status: 'PENDING',
      },
    ];

    const tx: ReconciledPlanningTransaction[] = [
      {
        id: 'tx-partial',
        accountId: 'acc-1',
        amount: 2000,
        date: '2026-10-04',
        type: 'CREDIT',
        status: 'SETTLED',
        description: 'ADIANTAMENTO SALARIAL',
        isIgnored: 0,
        normalizedAmount: 2000,
        canonicalType: 'CREDIT',
        isOperatingFlow: true,
      },
    ];

    const result = calculateCashFlowProjection({
      referenceMonth: '2026-10',
      accounts,
      reconciledTransactions: tx,
      recurringFlows: flows,
      liabilities: [],
      goals: [],
      occurrences,
      todayDate: '2026-10-16',
    });

    const ind = result.indicators;
    // 1. realizedIncomePeriod = 2000 (transação realizada)
    assert.strictEqual(ind.realizedIncomePeriod, 2000);
    // 2. expectedIncomePeriod = 3000.25 + 3000.30 = 6000.55
    assert.strictEqual(ind.expectedIncomePeriod, 6000.55);
    // 3. activeRecurringIncome = 6000.55
    assert.strictEqual(ind.activeRecurringIncome, 6000.55);
    // 4. overdueUnreconciledIncome = 3000.25 (ocorrência OVERDUE)
    assert.strictEqual(ind.overdueUnreconciledIncome, 3000.25);
    // 5. expectedExpensesPeriod = 2500.25
    assert.strictEqual(ind.expectedExpensesPeriod, 2500.25);
    // 6. projectedClosingBalance = 4000
    assert.strictEqual(ind.projectedClosingBalance, 4000);
    // 7. futureCommitmentRatePct = (2500.25 / 6000.55) * 100 = 41.67%
    assert.strictEqual(ind.futureCommitmentRatePct, 41.67);
    // 8. varianceExpectationVsRealized = 2000 - 6000.55 = -4000.55
    assert.strictEqual(ind.varianceExpectationVsRealized, -4000.55);
  });

  it('6. Confirmação manual de ocorrência (MANUALLY_CONFIRMED) preserva auditoria sem alterar saldo bancário', () => {
    const occ: RecurringOccurrenceModel = {
      id: 'occ-manual-test',
      flowId: 'flow-salario',
      expectedDate: '2026-10-10',
      expectedAmount: 1500,
      status: 'PENDING',
    };

    // Aplicação da confirmação manual
    const manuallyConfirmed: RecurringOccurrenceModel = {
      ...occ,
      status: 'MANUALLY_CONFIRMED',
      reconciledAmount: 1500,
      reconciledAt: '2026-10-10T15:00:00Z',
      notes: 'Confirmado via recibo em papel pelo usuário',
    };

    assert.strictEqual(manuallyConfirmed.status, 'MANUALLY_CONFIRMED');
    assert.strictEqual(manuallyConfirmed.transactionId, undefined);
    assert.strictEqual(manuallyConfirmed.reconciledAmount, 1500);

    // Desaplicação/Reversão restaura PENDING
    const reverted = unapplyReconciliation(manuallyConfirmed);
    assert.strictEqual(reverted.status, 'PENDING');
    assert.strictEqual(reverted.reconciledAmount, null);
    assert.strictEqual(reverted.transactionId, null);
  });

  it('7. Projeção prospectiva plurimensal (ANNUAL e QUARTERLY): despesas e receitas anuais/trimestrais não são replicadas indevidamente todo mês', () => {
    const recurringFlows: RecurringFlowInput[] = [
      {
        id: 'flow-ipva-anual',
        title: 'IPVA Anual',
        type: 'EXPENSE',
        nature: 'CONFIRMED',
        amount: 2400,
        frequency: 'ANNUAL',
        startMonth: '2027-01',
        isActive: 1,
      },
      {
        id: 'flow-dividendos-trimestrais',
        title: 'Dividendos Trimestrais',
        type: 'INCOME',
        nature: 'CONFIRMED',
        amount: 3000,
        frequency: 'QUARTERLY',
        startMonth: '2026-10',
        isActive: 1,
      },
    ];

    const result = calculateCashFlowProjection({
      referenceMonth: '2026-10',
      horizonMonths: 6,
      accounts: baseAccounts,
      reconciledTransactions: [],
      recurringFlows,
      liabilities: [],
      goals: [],
      occurrences: [],
      todayDate: '2026-10-01',
    });

    // Meses projetados:
    // 0: 2026-10 -> Dividendos (mês inicial trimestral: +3000). IPVA: 0.
    // 1: 2026-11 -> Dividendos: 0. IPVA: 0.
    // 2: 2026-12 -> Dividendos: 0. IPVA: 0.
    // 3: 2027-01 -> Dividendos: +3000 (3 meses depois). IPVA: 2400 (Janeiro).
    // 4: 2027-02 -> Dividendos: 0. IPVA: 0.
    // 5: 2027-03 -> Dividendos: 0. IPVA: 0.

    const m0 = result.months[0];
    const m1 = result.months[1];
    const m2 = result.months[2];
    const m3 = result.months[3];
    const m4 = result.months[4];

    assert.strictEqual(m0.month, '2026-10');
    assert.strictEqual(m1.month, '2026-11');
    assert.strictEqual(m2.month, '2026-12');
    assert.strictEqual(m3.month, '2027-01');
    assert.strictEqual(m4.month, '2027-02');

    // Mês 1 (Novembro/2026): IPVA não deve ser cobrado (0) e dividendos não caem (0)
    assert.strictEqual(m1.confirmed.recurringOutflows, 0, 'IPVA anual não deve ser cobrado em Novembro');
    assert.strictEqual(m1.confirmed.recurringInflows, 0, 'Dividendos trimestrais não caem em Novembro');
    assert.strictEqual(m1.confirmed.priorUnsettledCardInvoice, 1200, 'Fatura do cartão de Outubro vence em Novembro');
    assert.strictEqual(m1.confirmed.totalOutflows, 1200, 'Total de saídas em Novembro é apenas a fatura do cartão');

    // Mês 2 (Dezembro/2026): IPVA não deve ser cobrado (0)
    assert.strictEqual(m2.confirmed.recurringOutflows, 0, 'IPVA anual não deve ser cobrado em Dezembro');
    assert.strictEqual(m2.confirmed.totalOutflows, 0, 'Nenhum compromisso agendado em Dezembro');

    // Mês 3 (Janeiro/2027): IPVA anual deve ser cobrado (2400) e Dividendos trimestrais caem (3000)
    assert.strictEqual(m3.confirmed.recurringOutflows, 2400, 'IPVA anual de 2400 deve ser cobrado em Janeiro/2027');
    assert.strictEqual(m3.confirmed.recurringInflows, 3000, 'Dividendos trimestrais de 3000 caem em Janeiro/2027 (mês 0 + 3)');
    assert.strictEqual(m3.confirmed.totalOutflows, 2400, 'Total de saídas confirmadas em Janeiro é o IPVA');

    // Mês 4 (Fevereiro/2027): IPVA não deve ser cobrado (0)
    assert.strictEqual(m4.confirmed.recurringOutflows, 0, 'IPVA anual não deve ser cobrado em Fevereiro/2027');
    assert.strictEqual(m4.confirmed.totalOutflows, 0, 'Nenhum compromisso agendado em Fevereiro');
  });
});
