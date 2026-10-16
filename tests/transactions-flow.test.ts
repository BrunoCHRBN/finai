import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { 
  normalizeTransactionValues, 
  isIncomeTransaction, 
  isExpenseTransaction,
  isTransferTransaction,
  isIgnoredTransaction,
  detectAndReconcileSelfTransfers,
  isInvoicePaymentDescription
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
      assert.strictEqual(isIncomeTransaction({ amount: 100, type: 'TRANSFER' }), false);
    });

    it('isExpenseTransaction correctly identifies debit transactions and negative amounts', () => {
      assert.strictEqual(isExpenseTransaction({ amount: -40, type: 'DEBIT' }), true);
      assert.strictEqual(isExpenseTransaction({ amount: 40, type: 'DEBIT' }), true);
      assert.strictEqual(isExpenseTransaction({ amount: 100, type: 'CREDIT' }), false);
      assert.strictEqual(isExpenseTransaction({ amount: -100, type: 'CREDIT' }), false);
      assert.strictEqual(isExpenseTransaction({ amount: -50, type: 'TRANSFER' }), false);
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

    it('isTransferTransaction correctly identifies transfer transactions', () => {
      assert.strictEqual(isTransferTransaction({ type: 'TRANSFER' }), true);
      assert.strictEqual(isTransferTransaction({ type: 'transfer' }), true);
      assert.strictEqual(isTransferTransaction({ type: 'DEBIT' }), false);
      assert.strictEqual(isTransferTransaction({ type: 'CREDIT' }), false);
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

      for (const item of syncIncoming) {
        const norm = normalizeTransactionValues(item);
        ledger.set(item.id, { id: item.id, ...norm });
      }
      assert.strictEqual(ledger.size, 2);

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

  describe('7. Frente B — Self-Transfers & Internal Pairings', () => {
    it('confirmed transfer does not increase totalIncome or totalExpenses', () => {
      const txs = [
        { id: 'tx-salary', amount: 3000, type: 'CREDIT', date: '2026-10-01' },
        { id: 'tx-tr-out', amount: -500, type: 'TRANSFER', date: '2026-10-02' },
        { id: 'tx-tr-in', amount: 500, type: 'TRANSFER', date: '2026-10-02' },
        { id: 'tx-groceries', amount: -150, type: 'DEBIT', date: '2026-10-03' },
      ];
      const accounts = [
        { id: 'acc-c6', type: 'CHECKING', balance: 2500 },
        { id: 'acc-itau', type: 'CHECKING', balance: 500 },
      ];

      const metrics = calculateFinancialMetrics(txs, accounts, []);

      // Salary is 3000, Groceries is 150. Transfers of 500 are neutral!
      assert.strictEqual(metrics.totalIncome, 3000);
      assert.strictEqual(metrics.totalExpenses, 150);
      assert.strictEqual(metrics.netCashFlow, 2850);
    });

    it('detectAndReconcileSelfTransfers matches paired outflow and inflow between user accounts', () => {
      const userAccounts = new Set(['acc-c6', 'acc-itau']);
      const txs = [
        { id: 'tx-1', accountId: 'acc-itau', amount: -720, type: 'DEBIT', date: '2026-10-04', description: 'Pix enviado Bruno' },
        { id: 'tx-2', accountId: 'acc-c6', amount: 720, type: 'CREDIT', date: '2026-10-04', description: 'Bruno Vinicius' },
        { id: 'tx-external', accountId: 'acc-c6', amount: -50, type: 'DEBIT', date: '2026-10-04', description: 'Farmácia' },
      ];

      const reconciled = detectAndReconcileSelfTransfers(txs, userAccounts);

      const tx1 = reconciled.find((t) => t.id === 'tx-1')!;
      const tx2 = reconciled.find((t) => t.id === 'tx-2')!;
      const ext = reconciled.find((t) => t.id === 'tx-external')!;

      assert.strictEqual(tx1.type, 'TRANSFER');
      assert.strictEqual(tx2.type, 'TRANSFER');
      assert.strictEqual(tx1.transferId, tx2.transferId);
      assert.strictEqual(ext.type, 'DEBIT');
      assert.strictEqual(ext.transferId, undefined);
    });

    it('does not classify transaction as self-transfer if counterpart account is external', () => {
      const userAccounts = new Set(['acc-c6']); // Only C6 is user's account
      const txs = [
        { id: 'tx-1', accountId: 'acc-c6', amount: -100, type: 'DEBIT', date: '2026-10-04', description: 'Pix para amigo' },
      ];

      const reconciled = detectAndReconcileSelfTransfers(txs, userAccounts);
      assert.strictEqual(reconciled[0].type, 'DEBIT');
    });
  });

  describe('8. Frente C — Credit Card Purchases & Invoice Payments', () => {
    it('credit card purchases are recognized as operating expenses', () => {
      const txs = [
        { id: 'card-1', amount: -19.90, type: 'DEBIT', date: '2026-10-05', description: 'Google Play' },
        { id: 'card-2', amount: -45.00, type: 'DEBIT', date: '2026-10-06', description: 'Restaurante' },
      ];
      const accounts = [{ id: 'acc-card', type: 'CREDIT_CARD', balance: 64.90 }];

      const metrics = calculateFinancialMetrics(txs, accounts, []);

      assert.strictEqual(metrics.totalExpenses, 64.90);
    });

    it('paying credit card invoice from checking is neutral and does not duplicate expenses', () => {
      // User spent 64.90 on card during the month
      // Then pays invoice from checking (-64.90)
      const txs = [
        { id: 'card-1', amount: -19.90, type: 'DEBIT', date: '2026-10-05', description: 'Google Play' },
        { id: 'card-2', amount: -45.00, type: 'DEBIT', date: '2026-10-06', description: 'Restaurante' },
        { id: 'chk-inv', amount: -64.90, type: 'TRANSFER', date: '2026-10-15', description: 'Pagamento Fatura Cartão' },
      ];
      const accounts = [
        { id: 'acc-chk', type: 'CHECKING', balance: 500 },
        { id: 'acc-card', type: 'CREDIT_CARD', balance: 0 },
      ];

      const metrics = calculateFinancialMetrics(txs, accounts, []);

      // Total expenses must remain 64.90 (NOT 129.80!)
      assert.strictEqual(metrics.totalExpenses, 64.90);
    });

    it('card fees, interest and additional charges are recognized as operating expenses', () => {
      const txs = [
        { id: 'fee-1', amount: -15.00, type: 'DEBIT', date: '2026-10-10', description: 'Tarifa Cartão Anuidade' },
        { id: 'int-1', amount: -8.50, type: 'DEBIT', date: '2026-10-10', description: 'Encargos de Financiamento' },
      ];
      const accounts = [{ id: 'acc-card', type: 'CREDIT_CARD', balance: 23.50 }];

      const metrics = calculateFinancialMetrics(txs, accounts, []);

      assert.strictEqual(metrics.totalExpenses, 23.50);
    });

    it('isInvoicePaymentDescription correctly detects invoice payment patterns', () => {
      assert.strictEqual(isInvoicePaymentDescription('Pagamento Fatura Cartão'), true);
      assert.strictEqual(isInvoicePaymentDescription('PGTO FATURA C6 BANK'), true);
      assert.strictEqual(isInvoicePaymentDescription('Pagamento Boleto BCO DO BRASIL S.A.'), true);
      assert.strictEqual(isInvoicePaymentDescription('Uber Viagem'), false);
      assert.strictEqual(isInvoicePaymentDescription('Supermercado Extra'), false);
    });
  });

  describe('9. Frente D — Flag is_ignored', () => {
    it('ignored transaction (isIgnored: 1) is completely excluded from financial metrics', () => {
      const txs = [
        { id: 'tx-1', amount: 1000, type: 'CREDIT', date: '2026-10-01', isIgnored: 0 },
        { id: 'tx-2', amount: 5000, type: 'CREDIT', date: '2026-10-02', isIgnored: 1 }, // Ignored bonus
        { id: 'tx-3', amount: -300, type: 'DEBIT', date: '2026-10-03', isIgnored: 0 },
        { id: 'tx-4', amount: -1200, type: 'DEBIT', date: '2026-10-04', isIgnored: 1 }, // Ignored anomalous expense
      ];
      const accounts = [{ id: 'acc-1', type: 'CHECKING', balance: 5000 }];

      const metrics = calculateFinancialMetrics(txs, accounts, []);

      assert.strictEqual(metrics.totalIncome, 1000);
      assert.strictEqual(metrics.totalExpenses, 300);
      assert.strictEqual(metrics.netCashFlow, 700);
    });

    it('restoring an ignored transaction (isIgnored: 0) brings it back into calculations', () => {
      const txs = [
        { id: 'tx-1', amount: 1000, type: 'CREDIT', date: '2026-10-01', isIgnored: 0 },
        { id: 'tx-2', amount: -300, type: 'DEBIT', date: '2026-10-02', isIgnored: 0 }, // Restored
      ];
      const accounts = [{ id: 'acc-1', type: 'CHECKING', balance: 5000 }];

      const metrics = calculateFinancialMetrics(txs, accounts, []);

      assert.strictEqual(metrics.totalIncome, 1000);
      assert.strictEqual(metrics.totalExpenses, 300);
      assert.strictEqual(metrics.netCashFlow, 700);
    });

    it('isIgnoredTransaction predicate returns correct boolean', () => {
      assert.strictEqual(isIgnoredTransaction({ isIgnored: 1 }), true);
      assert.strictEqual(isIgnoredTransaction({ isIgnored: true }), true);
      assert.strictEqual(isIgnoredTransaction({ isIgnored: 0 }), false);
      assert.strictEqual(isIgnoredTransaction({ isIgnored: false }), false);
      assert.strictEqual(isIgnoredTransaction({ isIgnored: null }), false);
      assert.strictEqual(isIgnoredTransaction({ isIgnored: undefined }), false);
    });
  });

  describe('10. Frente E — Manual Operations & Atomic Consistency (In-Memory DB)', () => {
    let memClient: ReturnType<typeof createClient>;

    const setupMemDb = async () => {
      memClient = createClient({ url: ':memory:' });
      await memClient.execute('PRAGMA foreign_keys = ON;');
      await memClient.execute(`
        CREATE TABLE accounts (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          balance REAL NOT NULL DEFAULT 0,
          currency_code TEXT NOT NULL DEFAULT 'BRL',
          pluggy_item_id TEXT,
          pluggy_account_id TEXT,
          updated_at TEXT NOT NULL
        );
      `);
      await memClient.execute(`
        CREATE TABLE transactions (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
          category_id TEXT,
          description TEXT NOT NULL,
          amount REAL NOT NULL,
          date TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'SETTLED',
          pluggy_transaction_id TEXT,
          transfer_id TEXT,
          is_ignored INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
      `);
      await memClient.execute(`
        INSERT INTO accounts (id, name, type, balance, updated_at) VALUES
        ('acc-c6', 'C6 Bank', 'CHECKING', 1000.0, '2026-10-15'),
        ('acc-itau', 'Itaú', 'CHECKING', 500.0, '2026-10-15');
      `);
    };

    it('creating manual expense atomically inserts transaction and decreases account balance', async () => {
      await setupMemDb();

      const txId = 'tx-manual-1';
      const expenseAmount = -150.0; // DEBIT

      await memClient.batch([
        {
          sql: `INSERT INTO transactions (id, account_id, description, amount, date, type, created_at)
                VALUES (?, ?, 'Supermercado', ?, '2026-10-15', 'DEBIT', '2026-10-15');`,
          args: [txId, 'acc-c6', expenseAmount],
        },
        {
          sql: `UPDATE accounts SET balance = balance + ? WHERE id = ?;`,
          args: [expenseAmount, 'acc-c6'],
        },
      ], 'write');

      const accRes = await memClient.execute("SELECT balance FROM accounts WHERE id = 'acc-c6'");
      assert.strictEqual(accRes.rows[0].balance, 850.0);

      const txRes = await memClient.execute("SELECT id, amount, type FROM transactions WHERE id = 'tx-manual-1'");
      assert.strictEqual(txRes.rows[0].amount, -150.0);
    });

    it('creating manual transfer atomically adjusts source and destination account balances', async () => {
      await setupMemDb();

      const transferAmount = 300.0;
      await memClient.batch([
        {
          sql: `INSERT INTO transactions (id, account_id, description, amount, date, type, transfer_id, created_at)
                VALUES ('tx-out', 'acc-c6', 'Transf para Itau', ?, '2026-10-15', 'TRANSFER', 'tr-1', '2026-10-15');`,
          args: [-transferAmount],
        },
        {
          sql: `INSERT INTO transactions (id, account_id, description, amount, date, type, transfer_id, created_at)
                VALUES ('tx-in', 'acc-itau', 'Transf do C6', ?, '2026-10-15', 'TRANSFER', 'tr-1', '2026-10-15');`,
          args: [transferAmount],
        },
        {
          sql: `UPDATE accounts SET balance = balance - ? WHERE id = 'acc-c6';`,
          args: [transferAmount],
        },
        {
          sql: `UPDATE accounts SET balance = balance + ? WHERE id = 'acc-itau';`,
          args: [transferAmount],
        },
      ], 'write');

      const c6Res = await memClient.execute("SELECT balance FROM accounts WHERE id = 'acc-c6'");
      const itauRes = await memClient.execute("SELECT balance FROM accounts WHERE id = 'acc-itau'");

      assert.strictEqual(c6Res.rows[0].balance, 700.0); // 1000 - 300
      assert.strictEqual(itauRes.rows[0].balance, 800.0); // 500 + 300
    });

    it('editing manual transaction amount adjusts account balance by the exact delta', async () => {
      await setupMemDb();

      // 1. Initial insert of -100
      await memClient.batch([
        {
          sql: `INSERT INTO transactions (id, account_id, description, amount, date, type, created_at)
                VALUES ('tx-edit', 'acc-c6', 'Gasolina', -100, '2026-10-15', 'DEBIT', '2026-10-15');`,
        },
        {
          sql: `UPDATE accounts SET balance = balance - 100 WHERE id = 'acc-c6';`,
        },
      ], 'write');

      let acc = await memClient.execute("SELECT balance FROM accounts WHERE id = 'acc-c6'");
      assert.strictEqual(acc.rows[0].balance, 900.0);

      // 2. Edit amount from -100 to -140 (delta = -40)
      const oldAmount = -100;
      const newAmount = -140;
      const delta = newAmount - oldAmount; // -40

      await memClient.batch([
        {
          sql: `UPDATE transactions SET amount = ? WHERE id = 'tx-edit';`,
          args: [newAmount],
        },
        {
          sql: `UPDATE accounts SET balance = balance + ? WHERE id = 'acc-c6';`,
          args: [delta],
        },
      ], 'write');

      acc = await memClient.execute("SELECT balance FROM accounts WHERE id = 'acc-c6'");
      assert.strictEqual(acc.rows[0].balance, 860.0); // 900 - 40 = 860
    });

    it('deleting manual transaction reverts account balance completely', async () => {
      await setupMemDb();

      // Insert -200
      await memClient.batch([
        {
          sql: `INSERT INTO transactions (id, account_id, description, amount, date, type, created_at)
                VALUES ('tx-del', 'acc-c6', 'Farmácia', -200, '2026-10-15', 'DEBIT', '2026-10-15');`,
        },
        {
          sql: `UPDATE accounts SET balance = balance - 200 WHERE id = 'acc-c6';`,
        },
      ], 'write');

      // Revert delete: balance = balance - (-200) = balance + 200
      await memClient.batch([
        {
          sql: `DELETE FROM transactions WHERE id = 'tx-del';`,
        },
        {
          sql: `UPDATE accounts SET balance = balance - (-200) WHERE id = 'acc-c6';`,
        },
      ], 'write');

      const acc = await memClient.execute("SELECT balance FROM accounts WHERE id = 'acc-c6'");
      assert.strictEqual(acc.rows[0].balance, 1000.0); // Restored to 1000.0!

      const tx = await memClient.execute("SELECT count(*) as count FROM transactions WHERE id = 'tx-del'");
      assert.strictEqual(tx.rows[0].count, 0);
    });

    it('failure midway in an atomic batch rolls back both transaction and balance changes', async () => {
      await setupMemDb();

      const accBefore = await memClient.execute("SELECT balance FROM accounts WHERE id = 'acc-c6'");
      assert.strictEqual(accBefore.rows[0].balance, 1000.0);

      try {
        await memClient.batch([
          {
            sql: `INSERT INTO transactions (id, account_id, description, amount, date, type, created_at)
                  VALUES ('tx-fail', 'acc-c6', 'Teste Falha', -50, '2026-10-15', 'DEBIT', '2026-10-15');`,
          },
          {
            sql: `UPDATE accounts SET balance = balance - 50 WHERE id = 'acc-c6';`,
          },
          {
            sql: `INSERT INTO non_existent_table VALUES (1);`, // Intentional SQL error!
          },
        ], 'write');
        assert.fail('Should have thrown an error');
      } catch (err: any) {
        assert.ok(err);
      }

      // Balance must remain unchanged due to rollback!
      const accAfter = await memClient.execute("SELECT balance FROM accounts WHERE id = 'acc-c6'");
      assert.strictEqual(accAfter.rows[0].balance, 1000.0);

      // Transaction must NOT exist!
      const txCheck = await memClient.execute("SELECT count(*) as count FROM transactions WHERE id = 'tx-fail'");
      assert.strictEqual(txCheck.rows[0].count, 0);
    });

    it('bank synced transaction deletion does not alter bank reference balance', async () => {
      await setupMemDb();

      // Synced transaction from Pluggy with pluggy_transaction_id
      await memClient.execute(`
        INSERT INTO transactions (id, account_id, description, amount, date, type, pluggy_transaction_id, created_at)
        VALUES ('tx-bank-1', 'acc-c6', 'Compra Padaria', -25, '2026-10-15', 'DEBIT', 'pluggy-123', '2026-10-15');
      `);

      // Deleting a bank transaction: only deletes the row, keeps account balance untouched
      await memClient.execute("DELETE FROM transactions WHERE id = 'tx-bank-1'");

      const acc = await memClient.execute("SELECT balance FROM accounts WHERE id = 'acc-c6'");
      assert.strictEqual(acc.rows[0].balance, 1000.0);
    });
  });

  describe('11. Frente F — Referential Integrity & Foreign Key Enforcement', () => {
    it('transaction referencing non-existent account is strictly rejected by SQLite foreign keys', async () => {
      const client = createClient({ url: ':memory:' });
      await client.execute('PRAGMA foreign_keys = ON;');
      await client.execute(`
        CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT);
      `);
      await client.execute(`
        CREATE TABLE transactions (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
          amount REAL NOT NULL
        );
      `);

      try {
        await client.execute(`
          INSERT INTO transactions (id, account_id, amount) VALUES ('tx-orphan', 'non-existent-acc', -50);
        `);
        assert.fail('Should have failed due to foreign key constraint violation');
      } catch (err: any) {
        assert.match(err.message, /FOREIGN KEY constraint failed/i);
      }
    });

    it('transaction referencing valid account succeeds', async () => {
      const client = createClient({ url: ':memory:' });
      await client.execute('PRAGMA foreign_keys = ON;');
      await client.execute(`
        CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT);
      `);
      await client.execute(`
        CREATE TABLE transactions (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
          amount REAL NOT NULL
        );
      `);

      await client.execute("INSERT INTO accounts (id, name) VALUES ('acc-real', 'Conta Real')");
      await client.execute("INSERT INTO transactions (id, account_id, amount) VALUES ('tx-valid', 'acc-real', 100)");

      const count = await client.execute('SELECT count(*) as count FROM transactions');
      assert.strictEqual(count.rows[0].count, 1);
    });
  });

});
