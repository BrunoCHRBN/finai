import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  normalizeTransactionValues, 
  isIncomeTransaction, 
  isExpenseTransaction 
} from '../src/lib/transactions.ts';
import { calculateFinancialMetrics } from '../src/lib/ai/math-engine.ts';

describe('FinAI Transaction Normalization & Inflows/Outflows Flow', () => {

  describe('1. Normalization of CREDIT (Entradas)', () => {
    it('should normalize positive credit amount to positive canonical amount', () => {
      const result = normalizeTransactionValues({ amount: 100, type: 'CREDIT' });
      assert.strictEqual(result.amount, 100);
      assert.strictEqual(result.type, 'CREDIT');
    });

    it('should normalize negative credit amount (e.g. inverted sign from provider) to positive canonical amount', () => {
      const result = normalizeTransactionValues({ amount: -100, type: 'CREDIT' });
      assert.strictEqual(result.amount, 100);
      assert.strictEqual(result.type, 'CREDIT');
    });

    it('should parse string with comma as decimal and normalize to positive credit', () => {
      const result = normalizeTransactionValues({ amount: '150,75', type: 'CREDIT' });
      assert.strictEqual(result.amount, 150.75);
      assert.strictEqual(result.type, 'CREDIT');
    });
  });

  describe('2. Normalization of DEBIT (Saídas)', () => {
    it('should normalize negative debit amount to negative canonical amount', () => {
      const result = normalizeTransactionValues({ amount: -40, type: 'DEBIT' });
      assert.strictEqual(result.amount, -40);
      assert.strictEqual(result.type, 'DEBIT');
    });

    it('should normalize positive debit amount (Pluggy Open Finance credit card purchase) to negative canonical amount', () => {
      // Real case observed with Google Play / Emergent on credit cards
      const result = normalizeTransactionValues({ amount: 19.90, type: 'DEBIT' });
      assert.strictEqual(result.amount, -19.90);
      assert.strictEqual(result.type, 'DEBIT');
    });

    it('should parse string with comma as decimal and normalize to negative debit', () => {
      const result = normalizeTransactionValues({ amount: '40,25', type: 'DEBIT' });
      assert.strictEqual(result.amount, -40.25);
      assert.strictEqual(result.type, 'DEBIT');
    });
  });

  describe('3. Edge cases and invalid inputs', () => {
    it('should coerce null amount to 0', () => {
      const result = normalizeTransactionValues({ amount: null, type: 'DEBIT' });
      assert.strictEqual(result.amount, -0);
      assert.strictEqual(result.type, 'DEBIT');
    });

    it('should coerce undefined amount to 0', () => {
      const result = normalizeTransactionValues({ amount: undefined, type: 'CREDIT' });
      assert.strictEqual(result.amount, 0);
      assert.strictEqual(result.type, 'CREDIT');
    });

    it('should coerce NaN amount to 0', () => {
      const result = normalizeTransactionValues({ amount: NaN, type: 'DEBIT' });
      assert.strictEqual(result.amount, -0);
      assert.strictEqual(result.type, 'DEBIT');
    });

    it('should infer type from sign when type is omitted', () => {
      const debitInferred = normalizeTransactionValues({ amount: -75 });
      assert.strictEqual(debitInferred.type, 'DEBIT');
      assert.strictEqual(debitInferred.amount, -75);

      const creditInferred = normalizeTransactionValues({ amount: 120 });
      assert.strictEqual(creditInferred.type, 'CREDIT');
      assert.strictEqual(creditInferred.amount, 120);
    });
  });

  describe('4. Acceptance Criteria: Balance & Totals Impact', () => {
    it('an inflow of R$ 100 must increase income and net cash flow by R$ 100', () => {
      const txs = [
        { id: 'tx-1', amount: 100, type: 'CREDIT', date: '2026-10-01' },
      ];
      const accounts = [{ id: 'acc-1', type: 'CHECKING', balance: 500 }];
      const categories: Array<{ id: string; name: string; group: string; budgetLimit: number }> = [];

      const metrics = calculateFinancialMetrics(txs, accounts, categories);

      assert.strictEqual(metrics.totalIncome, 100);
      assert.strictEqual(metrics.totalExpenses, 0);
      assert.strictEqual(metrics.netCashFlow, 100);
    });

    it('an outflow of R$ 40 must increase expenses by R$ 40 and decrease net cash flow by R$ 40', () => {
      const txs = [
        { id: 'tx-1', amount: -40, type: 'DEBIT', date: '2026-10-01' },
      ];
      const accounts = [{ id: 'acc-1', type: 'CHECKING', balance: 500 }];
      const categories: Array<{ id: string; name: string; group: string; budgetLimit: number }> = [];

      const metrics = calculateFinancialMetrics(txs, accounts, categories);

      assert.strictEqual(metrics.totalIncome, 0);
      assert.strictEqual(metrics.totalExpenses, 40);
      assert.strictEqual(metrics.netCashFlow, -40);
    });

    it('combined inflow of R$ 100 and outflow of R$ 40 must yield net cash flow of +R$ 60', () => {
      const txs = [
        { id: 'tx-in', amount: 100, type: 'CREDIT', date: '2026-10-01' },
        { id: 'tx-out', amount: -40, type: 'DEBIT', date: '2026-10-02' },
      ];
      const accounts = [{ id: 'acc-1', type: 'CHECKING', balance: 500 }];
      const categories: Array<{ id: string; name: string; group: string; budgetLimit: number }> = [];

      const metrics = calculateFinancialMetrics(txs, accounts, categories);

      assert.strictEqual(metrics.totalIncome, 100);
      assert.strictEqual(metrics.totalExpenses, 40);
      assert.strictEqual(metrics.netCashFlow, 60);
    });

    it('credit card purchase with positive incoming amount (+R$ 23.99) is correctly counted as expense and reduces net cash flow', () => {
      // Simulating un-normalized or raw Pluggy credit card purchase
      const normalized = normalizeTransactionValues({ amount: 23.99, type: 'DEBIT' });
      assert.strictEqual(normalized.amount, -23.99);

      const txs = [
        { id: 'tx-salary', amount: 2000, type: 'CREDIT', date: '2026-10-01' },
        { id: 'tx-card', amount: normalized.amount, type: normalized.type, date: '2026-10-05' },
      ];
      const accounts = [{ id: 'acc-1', type: 'CHECKING', balance: 2000 }];
      const categories: Array<{ id: string; name: string; group: string; budgetLimit: number }> = [];

      const metrics = calculateFinancialMetrics(txs, accounts, categories);

      assert.strictEqual(metrics.totalIncome, 2000);
      assert.strictEqual(metrics.totalExpenses, 23.99);
      assert.strictEqual(metrics.netCashFlow, 2000 - 23.99);
    });
  });

  describe('5. UI Filter Predicates', () => {
    it('isIncomeTransaction correctly identifies credit transactions and positive amounts', () => {
      assert.strictEqual(isIncomeTransaction({ amount: 100, type: 'CREDIT' }), true);
      assert.strictEqual(isIncomeTransaction({ amount: -100, type: 'CREDIT' }), true);
      assert.strictEqual(isIncomeTransaction({ amount: -50, type: 'DEBIT' }), false);
      assert.strictEqual(isIncomeTransaction({ amount: 50, type: 'DEBIT' }), false);
    });

    it('isExpenseTransaction correctly identifies debit transactions and negative amounts', () => {
      assert.strictEqual(isExpenseTransaction({ amount: -40, type: 'DEBIT' }), true);
      assert.strictEqual(isExpenseTransaction({ amount: 40, type: 'DEBIT' }), true);
      assert.strictEqual(isExpenseTransaction({ amount: 100, type: 'CREDIT' }), false);
      assert.strictEqual(isExpenseTransaction({ amount: -100, type: 'CREDIT' }), false);
    });

    it('filtering does not mutate original transaction data', () => {
      const original = [
        { id: 'tx-1', amount: 100, type: 'CREDIT' },
        { id: 'tx-2', amount: -40, type: 'DEBIT' },
      ];
      const copy = JSON.parse(JSON.stringify(original));

      const incomeOnly = original.filter(isIncomeTransaction);
      assert.strictEqual(incomeOnly.length, 1);
      assert.strictEqual(incomeOnly[0].id, 'tx-1');

      const expenseOnly = original.filter(isExpenseTransaction);
      assert.strictEqual(expenseOnly.length, 1);
      assert.strictEqual(expenseOnly[0].id, 'tx-2');

      assert.deepStrictEqual(original, copy);
    });
  });

  describe('6. Idempotency Simulation', () => {
    it('multiple normalizations of the same transaction remain identical', () => {
      const raw = { amount: 19.90, type: 'DEBIT' };
      const step1 = normalizeTransactionValues(raw);
      const step2 = normalizeTransactionValues(step1);
      const step3 = normalizeTransactionValues(step2);

      assert.strictEqual(step1.amount, -19.90);
      assert.strictEqual(step2.amount, -19.90);
      assert.strictEqual(step3.amount, -19.90);
      assert.strictEqual(step1.type, 'DEBIT');
      assert.strictEqual(step2.type, 'DEBIT');
      assert.strictEqual(step3.type, 'DEBIT');
    });

    it('simulated ledger does not duplicate transactions upon repeated sync', () => {
      const ledger = new Map<string, { id: string; amount: number; type: string }>();

      const syncIncoming = [
        { id: 'pluggy-1', amount: 50, type: 'CREDIT' },
        { id: 'pluggy-2', amount: 20, type: 'DEBIT' },
      ];

      // Sync 1
      for (const item of syncIncoming) {
        const norm = normalizeTransactionValues(item);
        ledger.set(item.id, { id: item.id, ...norm });
      }
      assert.strictEqual(ledger.size, 2);

      // Sync 2 (repeated)
      for (const item of syncIncoming) {
        const norm = normalizeTransactionValues(item);
        ledger.set(item.id, { id: item.id, ...norm });
      }
      assert.strictEqual(ledger.size, 2);

      const items = Array.from(ledger.values());
      assert.strictEqual(items.find((t) => t.id === 'pluggy-1')?.amount, 50);
      assert.strictEqual(items.find((t) => t.id === 'pluggy-2')?.amount, -20);
    });
  });

});
