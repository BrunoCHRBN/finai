import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCashFlowProjection,
  type PlanningAccountInput,
  type RecurringFlowInput,
  type RecurringOccurrenceInput,
} from '../src/lib/planning-engine.ts';
import {
  generateOccurrencesForFlow,
  evaluateReconciliation,
  type RecurringFlowModel,
  type RecurringOccurrenceModel,
  type TransactionForReconciliation,
} from '../src/lib/recurring-engine.ts';

describe('Sprint 7.1 — Correções de Precisão Temporal, Ocorrências Individuais e Conciliação Contábil', () => {
  const defaultCheckingAccount: PlanningAccountInput = {
    id: 'acc-checking-1',
    name: 'Conta Corrente Principal',
    type: 'CHECKING',
    balance: 5000,
  };

  // ==========================================================================
  // SECTION 2: Projeção de Fluxo de Caixa Baseada em Ocorrências Individuais
  // ==========================================================================
  describe('Seção 2: Ocorrências Individuais vs Fatores Médios Mensais', () => {
    it('1. 4 vs 5 ocorrências semanais em janela de 30 dias (elimina distorção de 4.33x)', () => {
      // Caso A: Fluxo semanal iniciando no primeiro dia (2026-10-01)
      // Janela de 30 dias: [2026-10-01, 2026-10-31] (31 dias inclusivos)
      // Ocorrências caem em: 01/10, 08/10, 15/10, 22/10, 29/10 -> exatamente 5 ocorrências!
      const weeklyFlow5: RecurringFlowInput = {
        id: 'flow-weekly-5',
        title: 'Serviço Semanal 5x',
        type: 'EXPENSE',
        nature: 'CONFIRMED',
        amount: 200,
        frequency: 'WEEKLY',
        startDate: '2026-10-01',
        startMonth: '2026-10',
        isActive: 1,
      };

      const proj5 = calculateCashFlowProjection({
        referenceMonth: '2026-10',
        todayDate: '2026-10-01',
        accounts: [defaultCheckingAccount],
        recurringFlows: [weeklyFlow5],
        reconciledTransactions: [],
        liabilities: [],
        goals: [],
        occurrences: [],
      });

      // Em vez de 200 * 4.333 = 866.67, deve ser rigorosamente 5 * 200 = 1000
      assert.strictEqual(
        proj5.horizonSummaries.days30.projectedOutflows,
        1000,
        'Fluxo com 5 ocorrências na janela deve somar exatamente R$ 1.000,00'
      );

      // Caso B: Fluxo semanal iniciando em 2026-10-04
      // Ocorrências caem em: 04/10, 11/10, 18/10, 25/10 -> exatamente 4 ocorrências (próxima seria 01/11 > 31/10)
      const weeklyFlow4: RecurringFlowInput = {
        id: 'flow-weekly-4',
        title: 'Serviço Semanal 4x',
        type: 'EXPENSE',
        nature: 'CONFIRMED',
        amount: 200,
        frequency: 'WEEKLY',
        startDate: '2026-10-04',
        startMonth: '2026-10',
        isActive: 1,
      };

      const proj4 = calculateCashFlowProjection({
        referenceMonth: '2026-10',
        todayDate: '2026-10-01',
        accounts: [defaultCheckingAccount],
        recurringFlows: [weeklyFlow4],
        reconciledTransactions: [],
        liabilities: [],
        goals: [],
        occurrences: [],
      });

      // Deve somar rigorosamente 4 * 200 = 800, e não 866.67
      assert.strictEqual(
        proj4.horizonSummaries.days30.projectedOutflows,
        800,
        'Fluxo com 4 ocorrências na janela deve somar exatamente R$ 800,00'
      );
    });

    it('2. Passo de 14 dias (BIWEEKLY) respeita intervalo estrito', () => {
      const biweeklyFlow: RecurringFlowModel = {
        id: 'flow-biweekly',
        title: 'Pagamento Quinzenal',
        type: 'INCOME',
        nature: 'CONFIRMED',
        amount: 1500,
        amountType: 'FIXED',
        frequency: 'BIWEEKLY',
        startDate: '2026-10-01',
        startMonth: '2026-10',
        isActive: 1,
      };

      // Janela de 30 dias a partir de 2026-10-01
      const occs = generateOccurrencesForFlow(biweeklyFlow, '2026-10-01', '2026-10-31');
      assert.strictEqual(occs.length, 3, 'Deve gerar exatamente 3 ocorrências em 31 dias');
      assert.strictEqual(occs[0].expectedDate, '2026-10-01');
      assert.strictEqual(occs[1].expectedDate, '2026-10-15');
      assert.strictEqual(occs[2].expectedDate, '2026-10-29');
    });

    it('3. Clamping no dia 31 em meses curtos (Fevereiro 28/29 e Abril 30)', () => {
      const endOfMonthFlow: RecurringFlowModel = {
        id: 'flow-end-month',
        title: 'Fechamento de Caixa',
        type: 'INCOME',
        nature: 'CONFIRMED',
        amount: 3000,
        amountType: 'FIXED',
        frequency: 'MONTHLY',
        dayOfMonth: 31,
        startDate: '2026-01-31',
        startMonth: '2026-01',
        isActive: 1,
      };

      // Gerar ao longo de 2026 (ano não bissexto) de Jan a Abr
      const occs2026 = generateOccurrencesForFlow(endOfMonthFlow, '2026-01-01', '2026-04-30');
      assert.strictEqual(occs2026.length, 4);
      assert.strictEqual(occs2026[0].expectedDate, '2026-01-31');
      assert.strictEqual(occs2026[1].expectedDate, '2026-02-28', 'Fev 2026 clampado para dia 28');
      assert.strictEqual(occs2026[2].expectedDate, '2026-03-31');
      assert.strictEqual(occs2026[3].expectedDate, '2026-04-30', 'Abril clampado para dia 30');

      // Em ano bissexto (2024)
      const occs2024 = generateOccurrencesForFlow(
        { ...endOfMonthFlow, startDate: '2024-02-01', startMonth: '2024-02' },
        '2024-02-01',
        '2024-02-29'
      );
      assert.strictEqual(occs2024.length, 1);
      assert.strictEqual(occs2024[0].expectedDate, '2024-02-29', 'Fev 2024 clampado para dia 29');
    });

    it('4. Fluxo trimestral (QUARTERLY) projeta apenas nos meses de competência', () => {
      const quarterlyFlow: RecurringFlowModel = {
        id: 'flow-trimestral',
        title: 'Bônus Trimestral',
        type: 'INCOME',
        nature: 'CONFIRMED',
        amount: 6000,
        amountType: 'FIXED',
        frequency: 'QUARTERLY',
        dayOfMonth: 15,
        startDate: '2026-01-15',
        startMonth: '2026-01',
        isActive: 1,
      };

      const occs = generateOccurrencesForFlow(quarterlyFlow, '2026-01-01', '2026-12-31');
      assert.strictEqual(occs.length, 4, 'Exatamente 4 ocorrências em 1 ano');
      assert.deepStrictEqual(
        occs.map((o) => o.expectedDate),
        ['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15']
      );
    });

    it('5. Fluxo anual (YEARLY) projeta apenas no mês de aniversário', () => {
      const yearlyFlow: RecurringFlowModel = {
        id: 'flow-anual',
        title: 'IPVA Anual',
        type: 'EXPENSE',
        nature: 'CONFIRMED',
        amount: 2400,
        amountType: 'FIXED',
        frequency: 'YEARLY',
        dayOfMonth: 10,
        startDate: '2026-03-10',
        startMonth: '2026-03',
        isActive: 1,
      };

      const occs = generateOccurrencesForFlow(yearlyFlow, '2026-01-01', '2026-12-31');
      assert.strictEqual(occs.length, 1, 'Exatamente 1 ocorrência no ano');
      assert.strictEqual(occs[0].expectedDate, '2026-03-10');
      assert.strictEqual(occs[0].expectedAmount, 2400);
    });

    it('6. Limites de horizonte: inclusivo no dia 30 e exclusivo no dia 31', () => {
      // refDate = 2026-10-01 -> targetDate30 = 2026-10-31; targetDate60 = 2026-11-30
      const occExactBoundary: RecurringOccurrenceInput = {
        id: 'occ-boundary-30',
        flowId: 'flow-test',
        expectedDate: '2026-10-31', // Exatamente dia 30 a partir de 01/10
        expectedAmount: 500,
        status: 'PENDING',
      };
      const occOutside30: RecurringOccurrenceInput = {
        id: 'occ-outside-30',
        flowId: 'flow-test',
        expectedDate: '2026-11-01', // Dia 31 a partir de 01/10
        expectedAmount: 700,
        status: 'PENDING',
      };

      const flowTest: RecurringFlowInput = {
        id: 'flow-test',
        type: 'EXPENSE',
        nature: 'CONFIRMED',
        amount: 500,
        frequency: 'MONTHLY',
        isActive: 1,
      };

      const proj = calculateCashFlowProjection({
        referenceMonth: '2026-10',
        todayDate: '2026-10-01',
        accounts: [defaultCheckingAccount],
        recurringFlows: [flowTest],
        reconciledTransactions: [],
        liabilities: [],
        goals: [],
        occurrences: [occExactBoundary, occOutside30],
      });

      // No horizonte de 30 dias: deve incluir apenas o 500
      assert.strictEqual(
        proj.horizonSummaries.days30.projectedOutflows,
        500,
        'Ocorrência exatamente na data limite de 30 dias deve ser incluída'
      );

      // No horizonte de 60 dias: inclui ambos (500 + 700 = 1200)
      assert.strictEqual(
        proj.horizonSummaries.days60.projectedOutflows,
        1200,
        'Ocorrência fora dos 30 dias deve ser incluída nos 60 dias'
      );
    });

    it('7. Ocorrência conciliada anterior à data de início é excluída do fluxo projetado futuro', () => {
      const pastReconciledOcc: RecurringOccurrenceInput = {
        id: 'occ-past-reconciled',
        flowId: 'flow-salario',
        expectedDate: '2026-09-28',
        expectedAmount: 5000,
        status: 'RECONCILED',
        transactionId: 'tx-synced-1',
      };

      const futureOcc: RecurringOccurrenceInput = {
        id: 'occ-future',
        flowId: 'flow-salario',
        expectedDate: '2026-10-15',
        expectedAmount: 5000,
        status: 'PENDING',
      };

      const salaryFlow: RecurringFlowInput = {
        id: 'flow-salario',
        type: 'INCOME',
        nature: 'CONFIRMED',
        amount: 5000,
        frequency: 'MONTHLY',
        isActive: 1,
      };

      const proj = calculateCashFlowProjection({
        referenceMonth: '2026-10',
        todayDate: '2026-10-01',
        accounts: [defaultCheckingAccount],
        recurringFlows: [salaryFlow],
        reconciledTransactions: [],
        liabilities: [],
        goals: [],
        occurrences: [pastReconciledOcc, futureOcc],
      });

      // Apenas a ocorrência futura de 15/10 deve constar nas entradas projetadas
      assert.strictEqual(
        proj.horizonSummaries.days30.projectedInflows,
        5000,
        'Ocorrência já conciliada no passado não pode inflacionar entradas futuras'
      );
    });

    it('8. Ocorrência vencida (OVERDUE) não inflaciona o saldo disponível futuro', () => {
      const overdueOcc: RecurringOccurrenceInput = {
        id: 'occ-overdue-rent',
        flowId: 'flow-aluguel-receber',
        expectedDate: '2026-09-20', // Passada
        expectedAmount: 2500,
        status: 'OVERDUE',
      };

      const flowRent: RecurringFlowInput = {
        id: 'flow-aluguel-receber',
        type: 'INCOME',
        nature: 'CONFIRMED',
        amount: 2500,
        frequency: 'MONTHLY',
        isActive: 1,
      };

      const proj = calculateCashFlowProjection({
        referenceMonth: '2026-10',
        todayDate: '2026-10-01',
        accounts: [{ ...defaultCheckingAccount, balance: 1000 }],
        recurringFlows: [flowRent],
        reconciledTransactions: [],
        liabilities: [],
        goals: [],
        occurrences: [overdueOcc],
      });

      // A ocorrência vencida deve ser apontada no indicador de auditoria
      assert.strictEqual(
        proj.indicators.overdueUnreconciledIncome,
        2500,
        'Deve computar 2500 em receitas vencidas e não conciliadas'
      );

      // Mas NÃO pode entrar no horizonte de 30 dias nem inflacionar o saldo inicial
      assert.strictEqual(
        proj.horizonSummaries.days30.projectedInflows,
        0,
        'Receita vencida não realizada não deve contar como entrada futura nos 30 dias'
      );
      assert.strictEqual(
        proj.horizonSummaries.days30.projectedClosingBalance,
        1000,
        'Saldo projetado não deve contar receita vencida não recebida'
      );
    });

    it('9. Mergulho temporário de liquidez: lowestProjectedBalance < 0 detectado mesmo com saldo final positivo', () => {
      // Saldo inicial: R$ 1.000,00
      // 05/10: Despesa de R$ 1.800,00 -> Saldo vai para -800,00!
      // 20/10: Entrada de R$ 3.000,00 -> Saldo recupera para +2.200,00!
      const expenseOcc: RecurringOccurrenceInput = {
        id: 'occ-exp',
        flowId: 'flow-exp',
        expectedDate: '2026-10-05',
        expectedAmount: 1800,
        status: 'PENDING',
      };
      const incomeOcc: RecurringOccurrenceInput = {
        id: 'occ-inc',
        flowId: 'flow-inc',
        expectedDate: '2026-10-20',
        expectedAmount: 3000,
        status: 'PENDING',
      };

      const flows: RecurringFlowInput[] = [
        { id: 'flow-exp', type: 'EXPENSE', nature: 'CONFIRMED', amount: 1800, frequency: 'MONTHLY', isActive: 1 },
        { id: 'flow-inc', type: 'INCOME', nature: 'CONFIRMED', amount: 3000, frequency: 'MONTHLY', isActive: 1 },
      ];

      const proj = calculateCashFlowProjection({
        referenceMonth: '2026-10',
        todayDate: '2026-10-01',
        accounts: [{ ...defaultCheckingAccount, balance: 1000 }],
        recurringFlows: flows,
        reconciledTransactions: [],
        liabilities: [],
        goals: [],
        occurrences: [expenseOcc, incomeOcc],
      });

      const h30 = proj.horizonSummaries.days30;
      assert.strictEqual(h30.projectedClosingBalance, 2200, 'Saldo final fecha positivo em +2200');
      assert.strictEqual(h30.lowestProjectedBalance, -800, 'Mínimo intrames detecta o mergulho em -800');
      assert.strictEqual(h30.lowestProjectedDate, '2026-10-05', 'Data do vale é exatamente 2026-10-05');
      assert.strictEqual(h30.isNegativeLiquidity, true, 'isNegativeLiquidity sinaliza o risco com fidelidade');
    });

    it('10. Consistência cumulativa e monotônica dos horizontes consecutivos (30, 60, 90 dias)', () => {
      const flowWeekly: RecurringFlowInput = {
        id: 'flow-weekly',
        type: 'EXPENSE',
        nature: 'CONFIRMED',
        amount: 250,
        frequency: 'WEEKLY',
        startDate: '2026-10-01',
        startMonth: '2026-10',
        isActive: 1,
      };

      const proj = calculateCashFlowProjection({
        referenceMonth: '2026-10',
        todayDate: '2026-10-01',
        accounts: [defaultCheckingAccount],
        recurringFlows: [flowWeekly],
        reconciledTransactions: [],
        liabilities: [],
        goals: [],
        occurrences: [],
      });

      const { days30, days60, days90 } = proj.horizonSummaries;
      assert.ok(
        days30.projectedOutflows <= days60.projectedOutflows,
        `days30 (${days30.projectedOutflows}) deve ser <= days60 (${days60.projectedOutflows})`
      );
      assert.ok(
        days60.projectedOutflows <= days90.projectedOutflows,
        `days60 (${days60.projectedOutflows}) deve ser <= days90 (${days90.projectedOutflows})`
      );
    });

    it('11. Comparação de 12 meses: BIWEEKLY (26/27 ocorrências a cada 14 dias) vs SEMIMONTHLY (estritamente 24 ocorrências)', () => {
      const biweeklyFlowStandard: RecurringFlowModel = {
        id: 'f-biweekly-std',
        title: 'Quinzenal 14d Primeira Segunda',
        type: 'INCOME',
        nature: 'CONFIRMED',
        amount: 1000,
        amountType: 'FIXED',
        frequency: 'BIWEEKLY',
        startDate: '2026-01-05',
        startMonth: '2026-01',
        isActive: 1,
      };

      const biweeklyFlowDay1: RecurringFlowModel = {
        id: 'f-biweekly-day1',
        title: 'Quinzenal 14d Começando dia 1',
        type: 'INCOME',
        nature: 'CONFIRMED',
        amount: 1000,
        amountType: 'FIXED',
        frequency: 'BIWEEKLY',
        startDate: '2026-01-01',
        startMonth: '2026-01',
        isActive: 1,
      };

      const semimonthlyFlow: RecurringFlowModel = {
        id: 'f-semimonthly',
        title: 'Semimensal 2 datas fixas',
        type: 'INCOME',
        nature: 'CONFIRMED',
        amount: 1000,
        amountType: 'FIXED',
        frequency: 'SEMIMONTHLY',
        dayOfMonth: 5,
        secondDayOfMonth: 20,
        startDate: '2026-01-01',
        startMonth: '2026-01',
        isActive: 1,
      };

      const occsBiweeklyStd = generateOccurrencesForFlow(biweeklyFlowStandard, '2026-01-01', '2026-12-31');
      const occsBiweeklyDay1 = generateOccurrencesForFlow(biweeklyFlowDay1, '2026-01-01', '2026-12-31');
      const occsSemimonthly = generateOccurrencesForFlow(semimonthlyFlow, '2026-01-01', '2026-12-31');

      // BIWEEKLY padrão (início 05/01) gera exatamente 26 ocorrências ao ano (350 dias entre a 1ª e a 26ª)
      assert.strictEqual(
        occsBiweeklyStd.length,
        26,
        'BIWEEKLY com início em 05/01 deve gerar exatamente 26 ocorrências no ano'
      );

      // BIWEEKLY com início em 01/01 gera 27 ocorrências pois dia 31/12 é exatamente o 364º dia (26º salto de 14 dias)
      assert.strictEqual(
        occsBiweeklyDay1.length,
        27,
        'BIWEEKLY com início em 01/01 atinge a 27ª ocorrência em 31/12'
      );

      // SEMIMONTHLY gera estritamente 2 ocorrências por mês = 24 ocorrências ao ano, sem oscilação
      assert.strictEqual(
        occsSemimonthly.length,
        24,
        'SEMIMONTHLY deve gerar exatamente 24 ocorrências (2 por mês)'
      );
    });
  });

  // ==========================================================================
  // SECTION 4: Conciliação Manual e Contratos Contábeis
  // ==========================================================================
  describe('Seção 4: Conciliação Manual e Contratos Contábeis', () => {
    it('Caso A: Confirmação administrativa sem movimentação bancária preserva saldo', () => {
      // Ocorrência marcada como MANUALLY_CONFIRMED ou CONFIRMED sem vínculo de transação bancária
      const occAdminConfirmed: RecurringOccurrenceInput = {
        id: 'occ-admin-confirmed',
        flowId: 'flow-honorarios',
        expectedDate: '2026-10-15',
        expectedAmount: 2000,
        status: 'MANUALLY_CONFIRMED',
        transactionId: null, // Sem transação vinculada
      };

      const flow: RecurringFlowInput = {
        id: 'flow-honorarios',
        type: 'INCOME',
        nature: 'CONFIRMED',
        amount: 2000,
        frequency: 'MONTHLY',
        isActive: 1,
      };

      const proj = calculateCashFlowProjection({
        referenceMonth: '2026-10',
        todayDate: '2026-10-01',
        accounts: [{ ...defaultCheckingAccount, balance: 5000 }],
        recurringFlows: [flow],
        reconciledTransactions: [],
        liabilities: [],
        goals: [],
        occurrences: [occAdminConfirmed],
      });

      // Saldo de abertura não foi artificialmente alterado
      assert.strictEqual(proj.months[0].openingLiquidBalance, 5000);
      // E a entrada futura continua computada no horizonte
      assert.strictEqual(proj.horizonSummaries.days30.projectedInflows, 2000);
    });

    it('Caso B: Movimentação de conta manual reflete no saldo e concilia ocorrência para evitar dupla contagem', () => {
      // O usuário lançou uma transação manual de R$ 2.000,00 que já está no saldo bancário
      const updatedAccount: PlanningAccountInput = {
        ...defaultCheckingAccount,
        balance: 7000, // 5000 + 2000 já creditado
      };

      // A ocorrência correspondente é conciliada com a transação
      const occReconciled: RecurringOccurrenceInput = {
        id: 'occ-manual-tx',
        flowId: 'flow-honorarios',
        expectedDate: '2026-10-02',
        expectedAmount: 2000,
        status: 'RECONCILED',
        transactionId: 'tx-manual-1',
      };

      const flow: RecurringFlowInput = {
        id: 'flow-honorarios',
        type: 'INCOME',
        nature: 'CONFIRMED',
        amount: 2000,
        frequency: 'MONTHLY',
        isActive: 1,
      };

      const proj = calculateCashFlowProjection({
        referenceMonth: '2026-10',
        todayDate: '2026-10-01',
        accounts: [updatedAccount],
        recurringFlows: [flow],
        reconciledTransactions: [],
        liabilities: [],
        goals: [],
        occurrences: [occReconciled],
      });

      // Saldo inicial contém os R$ 7.000,00
      assert.strictEqual(proj.months[0].openingLiquidBalance, 7000);
      // Ocorrência conciliada NÃO entra novamente no horizonte de 30 dias (evita contar R$ 2.000 duas vezes!)
      assert.strictEqual(
        proj.horizonSummaries.days30.projectedInflows,
        0,
        'Ocorrência conciliada com transação já refletida no saldo não pode gerar entrada futura duplicada'
      );
    });

    it('Caso C: Vínculo com transação real Pluggy (evaluateReconciliation)', () => {
      const occurrence: RecurringOccurrenceModel = {
        id: 'occ-netflix',
        flowId: 'flow-netflix',
        expectedDate: '2026-10-10',
        expectedAmount: 55.9,
        status: 'PENDING',
      };

      const flowNetflix: RecurringFlowModel = {
        id: 'flow-netflix',
        title: 'Netflix Mensal',
        type: 'EXPENSE',
        nature: 'CONFIRMED',
        amount: 55.9,
        amountType: 'FIXED',
        frequency: 'MONTHLY',
        dayOfMonth: 10,
        startDate: '2026-10-10',
        startMonth: '2026-10',
        isActive: 1,
      };

      const transactions: TransactionForReconciliation[] = [
        {
          id: 'tx-pluggy-netflix',
          date: '2026-10-10',
          amount: -55.9,
          type: 'DEBIT',
          description: 'NETFLIX.COM MENSAL',
          accountId: 'acc-card',
        },
        {
          id: 'tx-pluggy-padaria',
          date: '2026-10-10',
          amount: -25.0,
          type: 'DEBIT',
          description: 'PADARIA REAL',
          accountId: 'acc-card',
        },
      ];

      const evaluation = evaluateReconciliation(occurrence, flowNetflix, transactions);
      assert.strictEqual(evaluation.candidates.length, 1, 'Deve encontrar o candidato correspondente da Netflix');
      const candidate = evaluation.candidates[0];
      assert.strictEqual(candidate.transactionId, 'tx-pluggy-netflix');
      assert.strictEqual(candidate.isExactAmount, true);
      assert.strictEqual(candidate.isExactDate, true);
      assert.strictEqual(candidate.confidenceLevel, 'HIGH');
    });
  });

  // ==========================================================================
  // SECTION 7: Indicadores de Planejamento e Casos Extremos
  // ==========================================================================
  describe('Seção 7: Indicadores de Planejamento e Proteção Contra NaN/Divisões por Zero', () => {
    it('1. futureCommitmentRatePct com receita zero e despesas presentes retorna 0 (não 100% ou NaN)', () => {
      const expenseFlow: RecurringFlowInput = {
        id: 'flow-condominio',
        type: 'EXPENSE',
        nature: 'CONFIRMED',
        amount: 800,
        frequency: 'MONTHLY',
        isActive: 1,
      };

      const proj = calculateCashFlowProjection({
        referenceMonth: '2026-10',
        todayDate: '2026-10-01',
        accounts: [defaultCheckingAccount],
        recurringFlows: [expenseFlow],
        reconciledTransactions: [],
        liabilities: [],
        goals: [],
        occurrences: [],
      });

      // Receita esperada = 0, Despesas = 800
      assert.strictEqual(proj.indicators.expectedIncomePeriod, 0);
      assert.strictEqual(proj.indicators.expectedExpensesPeriod, 800);
      assert.strictEqual(
        proj.indicators.futureCommitmentRatePct,
        0,
        'Comprometimento de receita inexistente deve ser 0% e não 100% ou NaN'
      );
      assert.ok(!Number.isNaN(proj.indicators.futureCommitmentRatePct));
    });

    it('2. futureCommitmentRatePct com receita zero e despesas zero retorna 0', () => {
      const proj = calculateCashFlowProjection({
        referenceMonth: '2026-10',
        todayDate: '2026-10-01',
        accounts: [defaultCheckingAccount],
        recurringFlows: [],
        reconciledTransactions: [],
        liabilities: [],
        goals: [],
        occurrences: [],
      });

      assert.strictEqual(proj.indicators.futureCommitmentRatePct, 0);
      assert.ok(!Number.isNaN(proj.indicators.futureCommitmentRatePct));
    });

    it('3. futureCommitmentRatePct com despesas maiores que receitas retorna porcentagem exata', () => {
      const flows: RecurringFlowInput[] = [
        { id: 'f-in', type: 'INCOME', nature: 'CONFIRMED', amount: 2000, frequency: 'MONTHLY', isActive: 1 },
        { id: 'f-out', type: 'EXPENSE', nature: 'CONFIRMED', amount: 3000, frequency: 'MONTHLY', isActive: 1 },
      ];

      const proj = calculateCashFlowProjection({
        referenceMonth: '2026-10',
        todayDate: '2026-10-01',
        accounts: [defaultCheckingAccount],
        recurringFlows: flows,
        reconciledTransactions: [],
        liabilities: [],
        goals: [],
        occurrences: [],
      });

      // 3000 / 2000 = 150%
      assert.strictEqual(proj.indicators.futureCommitmentRatePct, 150);
    });

    it('4. Saldo inicial negativo é processado sem falhas ou valores NaN', () => {
      const negativeAccount: PlanningAccountInput = {
        id: 'acc-overdrawn',
        name: 'Conta com Cheque Especial',
        type: 'CHECKING',
        balance: -2500,
      };

      const proj = calculateCashFlowProjection({
        referenceMonth: '2026-10',
        todayDate: '2026-10-01',
        accounts: [negativeAccount],
        recurringFlows: [],
        reconciledTransactions: [],
        liabilities: [],
        goals: [],
        occurrences: [],
      });

      assert.strictEqual(proj.months[0].openingLiquidBalance, -2500);
      assert.strictEqual(proj.horizonSummaries.days30.isNegativeLiquidity, true);
      assert.strictEqual(proj.horizonSummaries.days30.lowestProjectedBalance, -2500);
      assert.ok(!Number.isNaN(proj.months[0].closingTotalProjectedBalance));
      assert.ok(!Number.isNaN(proj.indicators.projectedClosingBalance));
    });
  });
});
