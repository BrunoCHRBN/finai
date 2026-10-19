import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLeapYear,
  getDaysInMonth,
  clampDay,
  daysBetween,
  addDays,
  generateOccurrencesForFlow,
  deriveOccurrenceStatus,
  type RecurringFlowModel,
} from '../src/lib/recurring-engine.ts';

describe('Sprint 7 — Fase 1: Periodicidade, Datas e Geração de Ocorrências Recorrentes', () => {
  it('1. Valida anos bissextos e quantidade de dias por mês', () => {
    assert.strictEqual(isLeapYear(2024), true, '2024 é bissexto');
    assert.strictEqual(isLeapYear(2025), false, '2025 não é bissexto');
    assert.strictEqual(isLeapYear(2026), false, '2026 não é bissexto');
    assert.strictEqual(isLeapYear(2028), true, '2028 é bissexto');
    assert.strictEqual(isLeapYear(2000), true, '2000 é bissexto (múltiplo de 400)');
    assert.strictEqual(isLeapYear(1900), false, '1900 não é bissexto (múltiplo de 100, não de 400)');

    assert.strictEqual(getDaysInMonth(2024, 2), 29, 'Fevereiro 2024 tem 29 dias');
    assert.strictEqual(getDaysInMonth(2025, 2), 28, 'Fevereiro 2025 tem 28 dias');
    assert.strictEqual(getDaysInMonth(2026, 4), 30, 'Abril tem 30 dias');
    assert.strictEqual(getDaysInMonth(2026, 1), 31, 'Janeiro tem 31 dias');
  });

  it('2. Clamping de dia em meses curtos e ano bissexto (dia 31 em Abril e Fevereiro)', () => {
    // Dia 31 em abril deve virar 30
    assert.strictEqual(clampDay(2026, 4, 31), 30);
    // Dia 31 em fevereiro não bissexto deve virar 28
    assert.strictEqual(clampDay(2026, 2, 31), 28);
    // Dia 31 em fevereiro bissexto deve virar 29
    assert.strictEqual(clampDay(2024, 2, 31), 29);
    // Dia 15 não deve ser alterado
    assert.strictEqual(clampDay(2026, 2, 15), 15);
  });

  it('3. Cálculo exato de dias entre datas e adição de dias', () => {
    assert.strictEqual(daysBetween('2026-10-01', '2026-10-05'), 4);
    assert.strictEqual(daysBetween('2026-10-05', '2026-10-01'), -4);
    assert.strictEqual(daysBetween('2026-10-01', '2026-10-01'), 0);
    assert.strictEqual(addDays('2026-10-01', 7), '2026-10-08');
    assert.strictEqual(addDays('2026-02-28', 1), '2026-03-01');
    assert.strictEqual(addDays('2024-02-28', 1), '2024-02-29'); // Leap year
  });

  it('4. Frequência MENSAL com dia 31 em transição de meses com 30, 31 e 28 dias', () => {
    const salaryFlow: RecurringFlowModel = {
      id: 'flow-salario-31',
      title: 'Salário Fim de Mês',
      type: 'INCOME',
      nature: 'CONFIRMED',
      amount: 8500,
      amountType: 'FIXED',
      frequency: 'MONTHLY',
      dayOfMonth: 31,
      startMonth: '2026-01',
      startDate: '2026-01-31',
      isActive: 1,
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const occurrences = generateOccurrencesForFlow(salaryFlow, '2026-01-01', '2026-05-31');
    const dates = occurrences.map((o) => o.expectedDate);

    // Janeiro (31), Fevereiro (28), Março (31), Abril (30), Maio (31)
    assert.deepStrictEqual(dates, [
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
  });

  it('5. Frequência SEMANAL e QUINZENAL (BIWEEKLY) geram passos determinísticos de 7 e 14 dias', () => {
    const weeklyFlow: RecurringFlowModel = {
      id: 'flow-semanal',
      title: 'Freelance Semanal',
      type: 'INCOME',
      nature: 'CONFIRMED',
      amount: 1200,
      amountType: 'VARIABLE',
      frequency: 'WEEKLY',
      startDate: '2026-10-01',
      startMonth: '2026-10',
      isActive: 1,
      status: 'ACTIVE',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    const weeklyOccs = generateOccurrencesForFlow(weeklyFlow, '2026-10-01', '2026-10-31');
    assert.deepStrictEqual(
      weeklyOccs.map((o) => o.expectedDate),
      ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29']
    );

    const biweeklyFlow: RecurringFlowModel = {
      ...weeklyFlow,
      id: 'flow-quinzenal',
      frequency: 'BIWEEKLY',
    };
    const biweeklyOccs = generateOccurrencesForFlow(biweeklyFlow, '2026-10-01', '2026-10-31');
    assert.deepStrictEqual(
      biweeklyOccs.map((o) => o.expectedDate),
      ['2026-10-01', '2026-10-15', '2026-10-29']
    );
  });

  it('6. Frequência TRIMESTRAL (QUARTERLY) e ANUAL (ANNUAL)', () => {
    const quarterlyFlow: RecurringFlowModel = {
      id: 'flow-trimestral',
      title: 'Bônus Trimestral',
      type: 'INCOME',
      nature: 'ESTIMATED',
      amount: 5000,
      amountType: 'VARIABLE',
      frequency: 'QUARTERLY',
      dayOfMonth: 10,
      startDate: '2026-01-10',
      startMonth: '2026-01',
      isActive: 1,
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const quarterlyOccs = generateOccurrencesForFlow(quarterlyFlow, '2026-01-01', '2026-12-31');
    assert.deepStrictEqual(
      quarterlyOccs.map((o) => o.expectedDate),
      ['2026-01-10', '2026-04-10', '2026-07-10', '2026-10-10']
    );

    const annualFlow: RecurringFlowModel = {
      id: 'flow-anual',
      title: '13º Salário',
      type: 'INCOME',
      nature: 'CONFIRMED',
      amount: 10000,
      amountType: 'FIXED',
      frequency: 'ANNUAL',
      dayOfMonth: 20,
      startDate: '2026-12-20',
      startMonth: '2026-12',
      isActive: 1,
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const annualOccs = generateOccurrencesForFlow(annualFlow, '2026-01-01', '2028-12-31');
    assert.deepStrictEqual(
      annualOccs.map((o) => o.expectedDate),
      ['2026-12-20', '2027-12-20', '2028-12-20']
    );
  });

  it('7. Evento único (ONCE) emite apenas uma ocorrência na data de agendamento', () => {
    const onceFlow: RecurringFlowModel = {
      id: 'flow-venda-carro',
      title: 'Venda de Veículo',
      type: 'INCOME',
      nature: 'CONFIRMED',
      amount: 45000,
      amountType: 'FIXED',
      frequency: 'ONCE',
      startDate: '2026-11-15',
      startMonth: '2026-11',
      isActive: 1,
      status: 'ACTIVE',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    const occs = generateOccurrencesForFlow(onceFlow, '2026-10-01', '2026-12-31');
    assert.strictEqual(occs.length, 1);
    assert.strictEqual(occs[0].expectedDate, '2026-11-15');
    assert.strictEqual(occs[0].expectedAmount, 45000);
  });

  it('8. Limite de parcelas (totalInstallments) encerra a geração de ocorrências', () => {
    const installmentFlow: RecurringFlowModel = {
      id: 'flow-parcelado',
      title: 'Consultoria 3x',
      type: 'INCOME',
      nature: 'CONFIRMED',
      amount: 3000,
      amountType: 'FIXED',
      frequency: 'MONTHLY',
      dayOfMonth: 5,
      startDate: '2026-10-05',
      startMonth: '2026-10',
      totalInstallments: 3,
      remainingInstallments: 3,
      isActive: 1,
      status: 'ACTIVE',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    const occs = generateOccurrencesForFlow(installmentFlow, '2026-10-01', '2027-10-01');
    assert.strictEqual(occs.length, 3);
    assert.deepStrictEqual(
      occs.map((o) => o.expectedDate),
      ['2026-10-05', '2026-11-05', '2026-12-05']
    );
  });

  it('9. Identidade estável de ocorrência previne duplicidades', () => {
    const flow: RecurringFlowModel = {
      id: 'flow-aluguel',
      title: 'Recebimento de Aluguel',
      type: 'INCOME',
      nature: 'CONFIRMED',
      amount: 2500,
      amountType: 'FIXED',
      frequency: 'MONTHLY',
      dayOfMonth: 10,
      startDate: '2026-10-10',
      startMonth: '2026-10',
      isActive: 1,
      status: 'ACTIVE',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    const run1 = generateOccurrencesForFlow(flow, '2026-10-01', '2026-10-31');
    const run2 = generateOccurrencesForFlow(flow, '2026-10-01', '2026-10-31');

    assert.strictEqual(run1[0].id, 'occ_flow-aluguel_2026-10-10');
    assert.strictEqual(run2[0].id, 'occ_flow-aluguel_2026-10-10');
    assert.strictEqual(run1[0].id, run2[0].id, 'IDs de ocorrências devem ser estáveis e determinísticos');
  });

  it('10. Derivação de status: PENDING se torna OVERDUE quando data passou sem conciliação', () => {
    const occPending = {
      expectedDate: '2026-10-25',
      status: 'PENDING' as const,
    };
    const occPast = {
      expectedDate: '2026-10-10',
      status: 'PENDING' as const,
    };
    const occReconciled = {
      expectedDate: '2026-10-05',
      status: 'RECONCILED' as const,
      transactionId: 'tx-123',
    };

    const today = '2026-10-16';
    assert.strictEqual(deriveOccurrenceStatus(occPending, today), 'PENDING');
    assert.strictEqual(deriveOccurrenceStatus(occPast, today), 'OVERDUE');
    assert.strictEqual(deriveOccurrenceStatus(occReconciled, today), 'RECONCILED');
  });

  it('11. Fluxos antigos (início em 2015 ou 2024) continuam gerando ocorrências na janela corrente de 2026 sem serem abortados prematuramente', () => {
    // Cenário: Salário ativo contratado em 2015 (mais de 130 meses no passado)
    const oldSalaryFlow: RecurringFlowModel = {
      id: 'flow-salario-2015',
      title: 'Salário CLT Histórico',
      type: 'INCOME',
      nature: 'CONFIRMED',
      amount: 15000,
      amountType: 'FIXED',
      frequency: 'MONTHLY',
      dayOfMonth: 5,
      startDate: '2015-01-05',
      startMonth: '2015-01',
      isActive: 1,
      status: 'ACTIVE',
      createdAt: '2015-01-05T00:00:00Z',
      updatedAt: '2015-01-05T00:00:00Z',
    };

    const occsMonthly = generateOccurrencesForFlow(oldSalaryFlow, '2026-10-01', '2026-12-31');
    assert.strictEqual(occsMonthly.length, 3, 'Deve gerar exatamente 3 ocorrências nos meses 10, 11 e 12 de 2026');
    assert.deepStrictEqual(
      occsMonthly.map((o) => o.expectedDate),
      ['2026-10-05', '2026-11-05', '2026-12-05']
    );

    // Cenário: Freelance semanal ativo desde janeiro de 2024 (>140 semanas no passado)
    const oldWeeklyFlow: RecurringFlowModel = {
      id: 'flow-weekly-2024',
      title: 'Consultoria Semanal 2024',
      type: 'INCOME',
      nature: 'CONFIRMED',
      amount: 2000,
      amountType: 'VARIABLE',
      frequency: 'WEEKLY',
      startDate: '2024-01-01',
      startMonth: '2024-01',
      isActive: 1,
      status: 'ACTIVE',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    const occsWeekly = generateOccurrencesForFlow(oldWeeklyFlow, '2026-10-01', '2026-10-31');
    assert.ok(occsWeekly.length >= 4, 'Deve gerar todas as semanas de outubro de 2026');
    for (const occ of occsWeekly) {
      assert.ok(occ.expectedDate.startsWith('2026-10-'), `Data ${occ.expectedDate} deve estar em outubro de 2026`);
    }
  });
});

