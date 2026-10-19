import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateReconciliation,
  applyReconciliation,
  unapplyReconciliation,
  type RecurringOccurrenceModel,
  type RecurringFlowModel,
  type TransactionForReconciliation,
} from '../src/lib/recurring-engine.ts';

describe('Sprint 7 — Fase 2: Motor de Conciliação e Detecção de Ambiguidades', () => {
  const baseFlow: RecurringFlowModel = {
    id: 'flow-salario',
    title: 'Salário Empresa XYZ',
    type: 'INCOME',
    nature: 'CONFIRMED',
    amount: 10000,
    amountType: 'FIXED',
    frequency: 'MONTHLY',
    dayOfMonth: 5,
    startDate: '2026-10-05',
    startMonth: '2026-10',
    isActive: 1,
    status: 'ACTIVE',
    destinationAccountId: 'acc-checking',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  const baseOccurrence: RecurringOccurrenceModel = {
    id: 'occ_flow-salario_2026-10-05',
    flowId: 'flow-salario',
    expectedDate: '2026-10-05',
    expectedAmount: 10000,
    status: 'PENDING',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  it('1. Correspondência exata: valor exato, data exata e conta correspondente', () => {
    const transactions: TransactionForReconciliation[] = [
      {
        id: 'tx-exact',
        accountId: 'acc-checking',
        amount: 10000,
        date: '2026-10-05',
        description: 'TED RECEBIDA EMPRESA XYZ SALARIO',
        type: 'CREDIT',
        isIgnored: 0,
      },
    ];

    const result = evaluateReconciliation(baseOccurrence, baseFlow, transactions);
    assert.strictEqual(result.canAutoReconcile, true, 'Deve permitir conciliação automática');
    assert.strictEqual(result.isAmbiguous, false, 'Não deve ser ambíguo');
    assert.ok(result.bestMatch);
    assert.strictEqual(result.bestMatch?.transactionId, 'tx-exact');
    assert.strictEqual(result.bestMatch?.isExactAmount, true);
    assert.strictEqual(result.bestMatch?.isExactDate, true);
    assert.strictEqual(result.bestMatch?.score, 1.0);
  });

  it('2. Salário recebido alguns dias antes ou depois (tolerância temporal)', () => {
    const txEarly: TransactionForReconciliation[] = [
      {
        id: 'tx-early',
        accountId: 'acc-checking',
        amount: 10000,
        date: '2026-10-03', // 2 dias antes
        description: 'TED RECEBIDA SALARIO XYZ',
        type: 'CREDIT',
        isIgnored: 0,
      },
    ];

    const resEarly = evaluateReconciliation(baseOccurrence, baseFlow, txEarly);
    assert.ok(resEarly.bestMatch);
    assert.strictEqual(resEarly.bestMatch?.transactionId, 'tx-early');
    assert.strictEqual(resEarly.bestMatch?.dateDeltaDays, -2);
    assert.ok(resEarly.bestMatch!.score >= 0.85, 'Deve pontuar alto para conciliação automática mesmo com 2 dias de antecedência');
    assert.strictEqual(resEarly.canAutoReconcile, true);
  });

  it('3. Salário com valor ligeiramente diferente do esperado (bônus ou desconto)', () => {
    const txDiffAmount: TransactionForReconciliation[] = [
      {
        id: 'tx-bonus',
        accountId: 'acc-checking',
        amount: 10450, // 4.5% a mais
        date: '2026-10-05',
        description: 'TED RECEBIDA SALARIO XYZ',
        type: 'CREDIT',
        isIgnored: 0,
      },
    ];

    const result = evaluateReconciliation(baseOccurrence, baseFlow, txDiffAmount);
    assert.ok(result.bestMatch);
    assert.strictEqual(result.bestMatch?.transactionId, 'tx-bonus');
    assert.strictEqual(result.bestMatch?.isExactAmount, false);
    // Deve ser pontuado como MEDIUM/HIGH mas requer atenção
    assert.ok(result.bestMatch!.score >= 0.70);
  });

  it('4. Detecção de ambiguidade: dois créditos semelhantes na mesma janela de datas', () => {
    const ambiguousTxs: TransactionForReconciliation[] = [
      {
        id: 'tx-cand-1',
        accountId: 'acc-checking',
        amount: 10000,
        date: '2026-10-05',
        description: 'CREDITO DIVERSO DOC',
        type: 'CREDIT',
        isIgnored: 0,
      },
      {
        id: 'tx-cand-2',
        accountId: 'acc-checking',
        amount: 10000,
        date: '2026-10-06',
        description: 'TED RECEBIDA',
        type: 'CREDIT',
        isIgnored: 0,
      },
    ];

    const result = evaluateReconciliation(baseOccurrence, baseFlow, ambiguousTxs);
    assert.strictEqual(result.candidates.length, 2, 'Deve identificar 2 candidatos viáveis');
    assert.strictEqual(result.isAmbiguous, true, 'Ambiguidade DEVE ser sinalizada para revisão do usuário');
    assert.strictEqual(result.canAutoReconcile, false, 'NUNCA deve conciliar automaticamente em caso de ambiguidade');
  });

  it('5. Débito NUNCA concilia ocorrência de receita', () => {
    const debitTx: TransactionForReconciliation[] = [
      {
        id: 'tx-debit',
        accountId: 'acc-checking',
        amount: -10000,
        date: '2026-10-05',
        description: 'PAGAMENTO BOLETO',
        type: 'DEBIT',
        isIgnored: 0,
      },
    ];

    const result = evaluateReconciliation(baseOccurrence, baseFlow, debitTx);
    assert.strictEqual(result.candidates.length, 0, 'Débito não pode ser candidato a conciliação de receita');
    assert.strictEqual(result.bestMatch, null);
  });

  it('6. Transação ignorada (isIgnored = 1) NUNCA é elegível para conciliação', () => {
    const ignoredTx: TransactionForReconciliation[] = [
      {
        id: 'tx-ignored',
        accountId: 'acc-checking',
        amount: 10000,
        date: '2026-10-05',
        description: 'SALARIO XYZ',
        type: 'CREDIT',
        isIgnored: 1, // IGNORADA
      },
    ];

    const result = evaluateReconciliation(baseOccurrence, baseFlow, ignoredTx);
    assert.strictEqual(result.candidates.length, 0, 'Transação ignorada deve ser excluída');
  });

  it('7. Transferência entre contas próprias (TRANSFER) NUNCA é conciliada como receita', () => {
    const transferTx: TransactionForReconciliation[] = [
      {
        id: 'tx-transfer',
        accountId: 'acc-checking',
        amount: 10000,
        date: '2026-10-05',
        description: 'TRANSFERENCIA ENTRE CONTAS',
        type: 'TRANSFER',
        isIgnored: 0,
      },
    ];

    const result = evaluateReconciliation(baseOccurrence, baseFlow, transferTx);
    assert.strictEqual(result.candidates.length, 0, 'Transferência própria não é receita operacional');
  });

  it('8. Idempotência e integridade da aplicação e desaplicação de conciliação', () => {
    const tx = { id: 'tx-100', amount: 10000 };
    const reconciled = applyReconciliation(baseOccurrence, tx, 0.95, 'Conciliado automaticamente');

    assert.strictEqual(reconciled.status, 'RECONCILED');
    assert.strictEqual(reconciled.transactionId, 'tx-100');
    assert.strictEqual(reconciled.reconciledAmount, 10000);
    assert.strictEqual(reconciled.confidenceScore, 0.95);
    // Desaplicação / cancelamento
    const unapplied = unapplyReconciliation(reconciled, '2026-10-16');
    assert.strictEqual(unapplied.status, 'OVERDUE', 'Como data é 2026-10-05 (< hoje 2026-10-16), volta como OVERDUE');
    assert.strictEqual(unapplied.transactionId, null);
    assert.strictEqual(unapplied.reconciledAmount, null);
  });

  it('9. Conciliação de despesa recorrente (EXPENSE/DEBIT): transações de débito são identificadas corretamente', () => {
    const expenseFlow: RecurringFlowModel = {
      id: 'flow-aluguel-despesa',
      title: 'Aluguel do Apartamento',
      type: 'EXPENSE',
      nature: 'CONFIRMED',
      amount: 3200,
      amountType: 'FIXED',
      frequency: 'MONTHLY',
      dayOfMonth: 10,
      startDate: '2026-10-10',
      startMonth: '2026-10',
      isActive: 1,
      status: 'ACTIVE',
      destinationAccountId: 'acc-checking',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    const expenseOccurrence: RecurringOccurrenceModel = {
      id: 'occ_flow-aluguel_2026-10-10',
      flowId: 'flow-aluguel-despesa',
      expectedDate: '2026-10-10',
      expectedAmount: 3200,
      status: 'PENDING',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    // Caso 1: Transação de débito canônica com valor negativo (-3200) e type DEBIT
    const txDebit1: TransactionForReconciliation[] = [
      {
        id: 'tx-rent-paid-neg',
        accountId: 'acc-checking',
        amount: -3200,
        date: '2026-10-10',
        description: 'PAGAMENTO BOLETO ALUGUEL',
        type: 'DEBIT',
        isIgnored: 0,
      },
    ];

    const res1 = evaluateReconciliation(expenseOccurrence, expenseFlow, txDebit1);
    assert.strictEqual(res1.canAutoReconcile, true, 'Deve conciliar despesa de valor negativo e tipo DEBIT');
    assert.strictEqual(res1.bestMatch?.transactionId, 'tx-rent-paid-neg');
    assert.strictEqual(res1.bestMatch?.isExactAmount, true);

    // Caso 2: Transação bancária de saída com valor positivo (+3200) mas type DEBIT (comum em cartões)
    const txDebit2: TransactionForReconciliation[] = [
      {
        id: 'tx-rent-paid-pos',
        accountId: 'acc-checking',
        amount: 3200,
        date: '2026-10-10',
        description: 'DEBITO AUTOMATICO ALUGUEL',
        type: 'DEBIT',
        isIgnored: 0,
      },
    ];

    const res2 = evaluateReconciliation(expenseOccurrence, expenseFlow, txDebit2);
    assert.strictEqual(res2.canAutoReconcile, true, 'Deve conciliar despesa de valor positivo com tipo DEBIT');
    assert.strictEqual(res2.bestMatch?.transactionId, 'tx-rent-paid-pos');

    // Caso 3: Crédito de 3200 (TED recebida) NUNCA deve ser conciliado com uma despesa de aluguel!
    const txCreditNotExpense: TransactionForReconciliation[] = [
      {
        id: 'tx-credit-received',
        accountId: 'acc-checking',
        amount: 3200,
        date: '2026-10-10',
        description: 'PIX RECEBIDO',
        type: 'CREDIT',
        isIgnored: 0,
      },
    ];

    const res3 = evaluateReconciliation(expenseOccurrence, expenseFlow, txCreditNotExpense);
    assert.strictEqual(res3.candidates.length, 0, 'Receita não pode ser conciliada como despesa de aluguel');
  });

  it('10. Transações já conciliadas não devem ser re-sugeridas ou duplicadas', () => {
    const txAlreadyReconciledId = 'tx-salario-pago';
    const allTransactions: TransactionForReconciliation[] = [
      {
        id: txAlreadyReconciledId,
        accountId: 'acc-checking',
        amount: 10000,
        date: '2026-10-05',
        description: 'SALARIO XYZ',
        type: 'CREDIT',
        isIgnored: 0,
      },
      {
        id: 'tx-salario-segundo',
        accountId: 'acc-checking',
        amount: 10000,
        date: '2026-10-06',
        description: 'OUTRO DEPOSITO',
        type: 'CREDIT',
        isIgnored: 0,
      },
    ];

    // Simulação do filtro implementado na rota GET /api/planning/occurrences
    const alreadyReconciledTxIds = new Set<string>([txAlreadyReconciledId]);
    const eligibleTx = allTransactions.filter((t) => !alreadyReconciledTxIds.has(t.id));

    assert.strictEqual(eligibleTx.length, 1);
    assert.strictEqual(eligibleTx[0].id, 'tx-salario-segundo');

    const result = evaluateReconciliation(baseOccurrence, baseFlow, eligibleTx);
    assert.strictEqual(result.bestMatch?.transactionId, 'tx-salario-segundo');
  });
});

