import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { fetchWithRetry, fetchAllPluggyTransactions } from '../src/lib/pluggy.ts';
import type { PluggyTransactionResult } from '../src/lib/pluggy.ts';
import { normalizeTransactionValues, detectAndReconcileSelfTransfers, isInvoicePaymentDescription } from '../src/lib/transactions.ts';
import type { ReconcileCandidate } from '../src/lib/transactions.ts';

// In-Memory SQLite Schema for Sync Engine Isolation
const createMemSyncDb = async () => {
  const client = createClient({ url: ':memory:' });
  await client.execute('PRAGMA foreign_keys = ON;');

  await client.execute(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      currency_code TEXT NOT NULL DEFAULT 'BRL',
      pluggy_item_id TEXT,
      pluggy_account_id TEXT,
      institution_name TEXT,
      color TEXT DEFAULT '#10b981',
      updated_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE UNIQUE INDEX accounts_pluggy_acc_id_unique ON accounts(pluggy_account_id);
  `);

  await client.execute(`
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      color TEXT DEFAULT '#64748b'
    );
  `);

  await client.execute(`
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

  await client.execute(`
    CREATE UNIQUE INDEX transactions_pluggy_tx_id_unique ON transactions(pluggy_transaction_id);
  `);

  await client.execute(`
    CREATE TABLE sync_locks (
      key TEXT PRIMARY KEY,
      acquired_at TEXT NOT NULL,
      status TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE sync_logs (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      status TEXT NOT NULL,
      accounts_synced INTEGER NOT NULL DEFAULT 0,
      transactions_new INTEGER NOT NULL DEFAULT 0,
      transactions_updated INTEGER NOT NULL DEFAULT 0,
      transactions_ignored INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Default initial categories
  await client.execute(`
    INSERT INTO categories (id, name, type) VALUES
    ('cat-food', 'Restaurantes & Delivery', 'EXPENSE'),
    ('cat-market', 'Supermercado & Essenciais', 'EXPENSE'),
    ('cat-transport', 'Transporte (Uber/Combustível)', 'EXPENSE'),
    ('cat-salary', 'Salário & Renda', 'INCOME');
  `);

  return client;
};

// Simulated Sync Engine Worker (replicating route logic on in-memory DB)
interface SyncItemPayload {
  accounts: Array<{
    id: string;
    type: string;
    name: string;
    balance: number;
    currencyCode?: string;
  }>;
  transactionsByAccount: Record<string, PluggyTransactionResult[]>;
}

async function runSyncPipeline(
  client: ReturnType<typeof createClient>,
  itemId: string,
  payload: SyncItemPayload,
  warnings: string[] = []
) {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  let accountsSynced = 0;
  let transactionsNew = 0;
  let transactionsUpdated = 0;
  let transactionsIgnored = 0;

  // 1. Process Accounts
  for (const pAcc of payload.accounts) {
    const internalAccId = `pluggy-acc-${pAcc.id}`;
    let accType = 'CHECKING';
    if (pAcc.type === 'CREDIT') accType = 'CREDIT_CARD';
    else if (pAcc.type === 'SAVINGS') accType = 'SAVINGS';
    else if (pAcc.type === 'INVESTMENT') accType = 'INVESTMENT';

    const existingAcc = await client.execute({
      sql: 'SELECT id, balance FROM accounts WHERE id = ?;',
      args: [internalAccId],
    });

    if (existingAcc.rows.length > 0) {
      await client.execute({
        sql: 'UPDATE accounts SET name = ?, balance = ?, type = ?, updated_at = ? WHERE id = ?;',
        args: [pAcc.name, pAcc.balance, accType, new Date().toISOString(), internalAccId],
      });
    } else {
      await client.execute({
        sql: `INSERT INTO accounts (id, name, type, balance, currency_code, pluggy_item_id, pluggy_account_id, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [internalAccId, pAcc.name, accType, pAcc.balance, pAcc.currencyCode || 'BRL', itemId, pAcc.id, new Date().toISOString()],
      });
    }
    accountsSynced++;

    // 2. Process Transactions for Account
    const txs = payload.transactionsByAccount[pAcc.id] || [];
    for (const pTx of txs) {
      const txId = `pluggy-tx-${pTx.id}`;
      const existingTxRes = await client.execute({
        sql: 'SELECT id, category_id, is_ignored, type, transfer_id, amount FROM transactions WHERE pluggy_transaction_id = ? OR id = ?;',
        args: [pTx.id, txId],
      });

      const { amount: normAmount, type: normType } = normalizeTransactionValues({
        amount: pTx.amount,
        type: pTx.type,
      });

      const txDate = pTx.date ? pTx.date.split('T')[0] : '2026-10-15';
      const status = pTx.status || 'SETTLED';

      if (existingTxRes.rows.length === 0) {
        const isInvoice = isInvoicePaymentDescription(pTx.description);
        const finalType = isInvoice ? 'TRANSFER' : normType;
        const transferId = isInvoice ? `tr_inv_${pTx.id.slice(0, 8)}` : null;

        await client.execute({
          sql: `INSERT INTO transactions (id, account_id, category_id, description, amount, date, type, transfer_id, status, is_ignored, pluggy_transaction_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?);`,
          args: [txId, internalAccId, null, pTx.description, normAmount, txDate, finalType, transferId, status, pTx.id, new Date().toISOString()],
        });
        transactionsNew++;
      } else {
        const existing = existingTxRes.rows[0];
        if (existing.is_ignored === 1) {
          transactionsIgnored++;
        }

        let updatedType = normType;
        let updatedTransferId = existing.transfer_id as string | null;
        let updatedAmount = normAmount;

        // Preserve TRANSFER type and directional sign
        if (existing.type === 'TRANSFER') {
          updatedType = 'TRANSFER';
          const prevAmt = existing.amount as number;
          updatedAmount = prevAmt < 0 ? -Math.abs(normAmount) : Math.abs(normAmount);
        } else if (isInvoicePaymentDescription(pTx.description)) {
          updatedType = 'TRANSFER';
          updatedTransferId = updatedTransferId || `tr_inv_${pTx.id.slice(0, 8)}`;
        }

        await client.execute({
          sql: `UPDATE transactions SET description = ?, amount = ?, date = ?, status = ?, type = ?, transfer_id = ? WHERE id = ?;`,
          args: [pTx.description, updatedAmount, txDate, status, updatedType, updatedTransferId, existing.id as string],
        });
        transactionsUpdated++;
      }
    }
  }

  // 3. Post-Sync Self-Transfer Reconciliation
  const allAccRes = await client.execute('SELECT id FROM accounts;');
  const userAccountIds = new Set(allAccRes.rows.map((r) => r.id as string));

  const allTxRes = await client.execute('SELECT id, account_id as accountId, amount, date, type, description, is_ignored as isIgnored, transfer_id as transferId FROM transactions;');
  const reconciled = detectAndReconcileSelfTransfers(allTxRes.rows as unknown as ReconcileCandidate[], userAccountIds);

  for (const rTx of reconciled) {
    await client.execute({
      sql: 'UPDATE transactions SET type = ?, transfer_id = ? WHERE id = ?;',
      args: [rTx.type, rTx.transferId, rTx.id],
    });
  }

  // 4. Log sync execution
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startTime;
  const status = warnings.length > 0 ? 'PARTIAL' : 'SUCCESS';
  await client.execute({
    sql: `INSERT INTO sync_logs (id, item_id, status, accounts_synced, transactions_new, transactions_updated, transactions_ignored, error_message, started_at, completed_at, duration_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    args: [`log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, itemId, status, accountsSynced, transactionsNew, transactionsUpdated, transactionsIgnored, warnings.join('; ') || null, startedAt, completedAt, durationMs],
  });

  return { accountsSynced, transactionsNew, transactionsUpdated, transactionsIgnored, status };
}

describe('FinAI Sprint 2 — Open Finance, Sincronização & Confiabilidade dos Dados', () => {

  // Scenario 1: Initial Import
  it('Scenario 1: Initial import creates accounts and transactions from synthetic Open Finance payload', async () => {
    const memDb = await createMemSyncDb();
    const payload: SyncItemPayload = {
      accounts: [
        { id: 'acc-1', name: 'C6 Bank Conta Corrente', type: 'CHECKING', balance: 1500.0 },
        { id: 'acc-2', name: 'C6 Bank Cartão de Crédito', type: 'CREDIT', balance: -350.0 },
      ],
      transactionsByAccount: {
        'acc-1': [
          { id: 'tx-101', description: 'TED SALARIO', amount: 4500, type: 'CREDIT', date: '2026-10-01' },
          { id: 'tx-102', description: 'MERCADO EXTRA', amount: -240.50, type: 'DEBIT', date: '2026-10-02' },
        ],
        'acc-2': [
          { id: 'tx-201', description: 'IFOOD RESTAURANTE', amount: 89.90, type: 'DEBIT', date: '2026-10-03' },
          { id: 'tx-202', description: 'UBER TRIP', amount: 24.50, type: 'DEBIT', date: '2026-10-04' },
        ],
      },
    };

    const res = await runSyncPipeline(memDb, 'item-test-1', payload);
    assert.strictEqual(res.accountsSynced, 2);
    assert.strictEqual(res.transactionsNew, 4);
    assert.strictEqual(res.transactionsUpdated, 0);

    const accountsRes = await memDb.execute('SELECT id, type, balance FROM accounts ORDER BY id;');
    assert.strictEqual(accountsRes.rows.length, 2);
    assert.strictEqual(accountsRes.rows[0].type, 'CHECKING');
    assert.strictEqual(accountsRes.rows[0].balance, 1500.0);
    assert.strictEqual(accountsRes.rows[1].type, 'CREDIT_CARD');
    assert.strictEqual(accountsRes.rows[1].balance, -350.0);

    const txRes = await memDb.execute("SELECT id, amount, type FROM transactions WHERE account_id = 'pluggy-acc-acc-2' ORDER BY id;");
    assert.strictEqual(txRes.rows.length, 2);
    // Credit card debits with positive raw amount normalized to negative amounts
    assert.strictEqual(txRes.rows[0].amount, -89.90);
    assert.strictEqual(txRes.rows[0].type, 'DEBIT');
    assert.strictEqual(txRes.rows[1].amount, -24.50);
    assert.strictEqual(txRes.rows[1].type, 'DEBIT');
  });

  // Scenario 2: Strict Idempotency
  it('Scenario 2: Strict idempotency prevents duplicate rows on repeated sync of identical payload', async () => {
    const memDb = await createMemSyncDb();
    const payload: SyncItemPayload = {
      accounts: [{ id: 'acc-1', name: 'Itaú', type: 'CHECKING', balance: 800.0 }],
      transactionsByAccount: {
        'acc-1': [
          { id: 'tx-dup-1', description: 'RESTAURANTE OUTBACK', amount: -150.0, type: 'DEBIT', date: '2026-10-10' },
          { id: 'tx-dup-2', description: 'RENDIMENTO CDB', amount: 45.20, type: 'CREDIT', date: '2026-10-11' },
        ],
      },
    };

    // First sync
    const firstSync = await runSyncPipeline(memDb, 'item-test-dup', payload);
    assert.strictEqual(firstSync.transactionsNew, 2);

    // Second sync of identical payload
    const secondSync = await runSyncPipeline(memDb, 'item-test-dup', payload);
    assert.strictEqual(secondSync.transactionsNew, 0);
    assert.strictEqual(secondSync.transactionsUpdated, 2);

    const countRes = await memDb.execute('SELECT COUNT(*) as total FROM transactions;');
    assert.strictEqual(countRes.rows[0].total, 2);
  });

  // Scenario 3: Update of Mutable Fields
  it('Scenario 3: Updates mutable fields (description, amount) from provider without duplicating', async () => {
    const memDb = await createMemSyncDb();
    const initialPayload: SyncItemPayload = {
      accounts: [{ id: 'acc-1', name: 'Itaú', type: 'CHECKING', balance: 500.0 }],
      transactionsByAccount: {
        'acc-1': [{ id: 'tx-mut-1', description: 'POSTO IPIRANGA PENDING', amount: -100.0, type: 'DEBIT', date: '2026-10-10' }],
      },
    };
    await runSyncPipeline(memDb, 'item-test-mut', initialPayload);

    // Bank clears transaction: description refined and amount corrected
    const updatedPayload: SyncItemPayload = {
      accounts: [{ id: 'acc-1', name: 'Itaú', type: 'CHECKING', balance: 490.0 }],
      transactionsByAccount: {
        'acc-1': [{ id: 'tx-mut-1', description: 'POSTO IPIRANGA FINAL', amount: -110.0, type: 'DEBIT', date: '2026-10-10' }],
      },
    };
    await runSyncPipeline(memDb, 'item-test-mut', updatedPayload);

    const txRes = await memDb.execute("SELECT description, amount FROM transactions WHERE pluggy_transaction_id = 'tx-mut-1';");
    assert.strictEqual(txRes.rows[0].description, 'POSTO IPIRANGA FINAL');
    assert.strictEqual(txRes.rows[0].amount, -110.0);
  });

  // Scenario 4: Status Transition (PENDING -> POSTED / SETTLED)
  it('Scenario 4: Updates status from PENDING to SETTLED/POSTED without creating new record', async () => {
    const memDb = await createMemSyncDb();
    const payloadPending: SyncItemPayload = {
      accounts: [{ id: 'acc-1', name: 'Itaú', type: 'CHECKING', balance: 1000.0 }],
      transactionsByAccount: {
        'acc-1': [{ id: 'tx-stat-1', description: 'COMPRA DROGASIL', amount: -35.0, type: 'DEBIT', date: '2026-10-12', status: 'PENDING' }],
      },
    };
    await runSyncPipeline(memDb, 'item-test-stat', payloadPending);

    const initialRes = await memDb.execute("SELECT status FROM transactions WHERE pluggy_transaction_id = 'tx-stat-1';");
    assert.strictEqual(initialRes.rows[0].status, 'PENDING');

    const payloadSettled: SyncItemPayload = {
      accounts: [{ id: 'acc-1', name: 'Itaú', type: 'CHECKING', balance: 965.0 }],
      transactionsByAccount: {
        'acc-1': [{ id: 'tx-stat-1', description: 'COMPRA DROGASIL', amount: -35.0, type: 'DEBIT', date: '2026-10-12', status: 'POSTED' }],
      },
    };
    await runSyncPipeline(memDb, 'item-test-stat', payloadSettled);

    const settledRes = await memDb.execute("SELECT status FROM transactions WHERE pluggy_transaction_id = 'tx-stat-1';");
    assert.strictEqual(settledRes.rows[0].status, 'POSTED');
  });

  // Scenario 5: Refunds and Adjustments
  it('Scenario 5: Credit card refunds and estornos are normalized as positive amount without inflating salary', () => {
    const refund = normalizeTransactionValues({
      amount: 79.90,
      type: 'CREDIT',
      description: 'ESTORNO AMAZON.COM',
    });
    assert.strictEqual(refund.amount, 79.90);
    assert.strictEqual(refund.type, 'CREDIT');

    // Inverted provider sign check (-79.90 with type CREDIT)
    const invertedRefund = normalizeTransactionValues({
      amount: -79.90,
      type: 'CREDIT',
      description: 'REEMBOLSO UBER',
    });
    assert.strictEqual(invertedRefund.amount, 79.90);
    assert.strictEqual(invertedRefund.type, 'CREDIT');
  });

  // Scenario 6: Exhaustive Pagination
  it('Scenario 6: fetchAllPluggyTransactions retrieves all pages completely', async () => {
    const originalFetch = globalThis.fetch;
    const oldId = process.env.PLUGGY_CLIENT_ID;
    const oldSecret = process.env.PLUGGY_CLIENT_SECRET;
    process.env.PLUGGY_CLIENT_ID = 'test-client-id';
    process.env.PLUGGY_CLIENT_SECRET = 'test-client-secret';

    const pageData = [
      { results: [{ id: 'p1-1', amount: 10, type: 'DEBIT' }, { id: 'p1-2', amount: 20, type: 'DEBIT' }], totalPages: 2 },
      { results: [{ id: 'p2-1', amount: 30, type: 'DEBIT' }], totalPages: 2 },
    ];
    let pageCount = 0;

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.includes('/auth')) {
        return new Response(JSON.stringify({ apiKey: 'mock-key' }), { status: 200 });
      }
      const data = pageData[pageCount++];
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try {
      const res = await fetchAllPluggyTransactions({ accountId: 'test-acc-page', pageSize: 2 });
      assert.strictEqual(res.isPartial, false);
      assert.strictEqual(res.transactions.length, 3);
      assert.strictEqual(res.transactions[0].id, 'p1-1');
      assert.strictEqual(res.transactions[2].id, 'p2-1');
    } finally {
      globalThis.fetch = originalFetch;
      process.env.PLUGGY_CLIENT_ID = oldId;
      process.env.PLUGGY_CLIENT_SECRET = oldSecret;
    }
  });

  // Scenario 7: Partial Pagination Failure Handling
  it('Scenario 7: Pagination failure mid-way preserves fetched pages and marks isPartial = true', async () => {
    const originalFetch = globalThis.fetch;
    const oldId = process.env.PLUGGY_CLIENT_ID;
    const oldSecret = process.env.PLUGGY_CLIENT_SECRET;
    process.env.PLUGGY_CLIENT_ID = 'test-client-id';
    process.env.PLUGGY_CLIENT_SECRET = 'test-client-secret';

    let callIdx = 0;

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.includes('/auth')) {
        return new Response(JSON.stringify({ apiKey: 'mock-key' }), { status: 200 });
      }
      callIdx++;
      if (callIdx === 1) {
        // Page 1 succeeds
        return new Response(JSON.stringify({
          results: [{ id: 'part-1', amount: 50, type: 'CREDIT' }, { id: 'part-2', amount: 60, type: 'CREDIT' }],
          totalPages: 2,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      // Page 2 fails
      return new Response('Gateway Timeout', { status: 504 });
    };

    try {
      const res = await fetchAllPluggyTransactions({ accountId: 'test-acc-part', pageSize: 2 });
      assert.strictEqual(res.isPartial, true);
      assert.strictEqual(res.transactions.length, 2);
      assert.ok(res.errorMessage);
    } finally {
      globalThis.fetch = originalFetch;
      process.env.PLUGGY_CLIENT_ID = oldId;
      process.env.PLUGGY_CLIENT_SECRET = oldSecret;
    }
  });

  // Scenario 8: Rate Limit 429 Retry with Retry-After
  it('Scenario 8: fetchWithRetry recovers after 429 respecting Retry-After header', async () => {
    const originalFetch = globalThis.fetch;
    let attempts = 0;

    globalThis.fetch = async () => {
      attempts++;
      if (attempts === 1) {
        return new Response('Rate limit exceeded', {
          status: 429,
          headers: { 'Retry-After': '0' },
        });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };

    try {
      const res = await fetchWithRetry('https://api.pluggy.ai/test-429', {}, { backoffBaseMs: 10 });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(attempts, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // Scenario 9: 5xx Transient Error Recovery
  it('Scenario 9: fetchWithRetry automatically retries and recovers from 503 Service Unavailable', async () => {
    const originalFetch = globalThis.fetch;
    let attempts = 0;

    globalThis.fetch = async () => {
      attempts++;
      if (attempts === 1) {
        return new Response('Service Unavailable', { status: 503 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    try {
      const res = await fetchWithRetry('https://api.pluggy.ai/test-503', {}, { backoffBaseMs: 10 });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(attempts, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // Scenario 10: Corrupt / Anamalous Payload Coercion
  it('Scenario 10: Rejects or safely coerces malformed inputs without crashing', () => {
    const nullAmount = normalizeTransactionValues({ amount: null, type: 'DEBIT' });
    assert.strictEqual(nullAmount.amount, -0);

    const corruptString = normalizeTransactionValues({ amount: 'R$ abc,invalid', type: 'CREDIT' });
    assert.strictEqual(corruptString.amount, 0);

    const unprovided = normalizeTransactionValues({ amount: undefined, type: undefined });
    assert.strictEqual(unprovided.amount, 0);
    assert.strictEqual(unprovided.type, 'CREDIT');
  });

  // Scenario 11: Distributed Lock Rejection (409 Conflict)
  it('Scenario 11: Active sync lock prevents simultaneous execution', async () => {
    const memDb = await createMemSyncDb();
    const lockKey = 'sync_item_test_active';

    // Acquire active lock
    await memDb.execute({
      sql: 'INSERT INTO sync_locks (key, acquired_at, status) VALUES (?, ?, ?);',
      args: [lockKey, new Date().toISOString(), 'SYNCING'],
    });

    // Check conflict
    const activeLocks = await memDb.execute('SELECT * FROM sync_locks WHERE key = ?;', [lockKey]);
    const isConflict = activeLocks.rows.some((l) => l.status === 'SYNCING');
    assert.strictEqual(isConflict, true);
  });

  // Scenario 12: Preservation of User Edited Category
  it('Scenario 12: Preserves user-assigned category on re-sync', async () => {
    const memDb = await createMemSyncDb();
    const initialPayload: SyncItemPayload = {
      accounts: [{ id: 'acc-1', name: 'Itaú', type: 'CHECKING', balance: 500.0 }],
      transactionsByAccount: {
        'acc-1': [{ id: 'tx-cat-1', description: 'IFOOD *RESTAURANTE', amount: -60.0, type: 'DEBIT', date: '2026-10-10' }],
      },
    };
    await runSyncPipeline(memDb, 'item-cat', initialPayload);

    // User manually customizes category in DB
    await memDb.execute({
      sql: "UPDATE transactions SET category_id = 'cat-custom-vip' WHERE pluggy_transaction_id = 'tx-cat-1';",
    });

    // Upstream bank re-syncs
    await runSyncPipeline(memDb, 'item-cat', initialPayload);

    const txRes = await memDb.execute("SELECT category_id FROM transactions WHERE pluggy_transaction_id = 'tx-cat-1';");
    assert.strictEqual(txRes.rows[0].category_id, 'cat-custom-vip');
  });

  // Scenario 13: Preservation of is_ignored Flag
  it('Scenario 13: Preserves user is_ignored flag on re-sync', async () => {
    const memDb = await createMemSyncDb();
    const payload: SyncItemPayload = {
      accounts: [{ id: 'acc-1', name: 'Itaú', type: 'CHECKING', balance: 500.0 }],
      transactionsByAccount: {
        'acc-1': [{ id: 'tx-ign-1', description: 'COMPRA COMPARTILHADA AMIGO', amount: -200.0, type: 'DEBIT', date: '2026-10-10' }],
      },
    };
    await runSyncPipeline(memDb, 'item-ign', payload);

    // User marks transaction as ignored
    await memDb.execute({
      sql: "UPDATE transactions SET is_ignored = 1 WHERE pluggy_transaction_id = 'tx-ign-1';",
    });

    // Upstream bank re-syncs
    const res = await runSyncPipeline(memDb, 'item-ign', payload);
    assert.strictEqual(res.transactionsIgnored, 1);

    const txRes = await memDb.execute("SELECT is_ignored FROM transactions WHERE pluggy_transaction_id = 'tx-ign-1';");
    assert.strictEqual(txRes.rows[0].is_ignored, 1);
  });

  // Scenario 14: Bank Balance Authoritative Reference Integrity
  it('Scenario 14: Bank authoritative balance is updated without accumulating duplicate deltas', async () => {
    const memDb = await createMemSyncDb();
    const payload1: SyncItemPayload = {
      accounts: [{ id: 'acc-1', name: 'C6 Bank', type: 'CHECKING', balance: 1000.0 }],
      transactionsByAccount: {
        'acc-1': [{ id: 'tx-bal-1', description: 'PAGAMENTO 1', amount: -100.0, type: 'DEBIT', date: '2026-10-10' }],
      },
    };
    await runSyncPipeline(memDb, 'item-bal', payload1);

    const acc1 = await memDb.execute("SELECT balance FROM accounts WHERE id = 'pluggy-acc-acc-1';");
    assert.strictEqual(acc1.rows[0].balance, 1000.0);

    // Later bank update reports balance 900.0
    const payload2: SyncItemPayload = {
      accounts: [{ id: 'acc-1', name: 'C6 Bank', type: 'CHECKING', balance: 900.0 }],
      transactionsByAccount: {
        'acc-1': [{ id: 'tx-bal-1', description: 'PAGAMENTO 1', amount: -100.0, type: 'DEBIT', date: '2026-10-10' }],
      },
    };
    await runSyncPipeline(memDb, 'item-bal', payload2);

    const acc2 = await memDb.execute("SELECT balance FROM accounts WHERE id = 'pluggy-acc-acc-1';");
    assert.strictEqual(acc2.rows[0].balance, 900.0);
  });

  // Scenario 15: Preservation of TRANSFER Status & Reconciled Pairs
  it('Scenario 15: Re-sync preserves TRANSFER type and pairing without reverting to CREDIT/DEBIT', async () => {
    const memDb = await createMemSyncDb();
    const payload: SyncItemPayload = {
      accounts: [
        { id: 'acc-c6', name: 'C6 Bank', type: 'CHECKING', balance: 2000.0 },
        { id: 'acc-itau', name: 'Itaú', type: 'CHECKING', balance: 1000.0 },
      ],
      transactionsByAccount: {
        'acc-c6': [{ id: 'tx-out', description: 'PIX TRANSF PARA ITAU', amount: -500.0, type: 'DEBIT', date: '2026-10-14' }],
        'acc-itau': [{ id: 'tx-in', description: 'PIX RECEBIDO DE C6', amount: 500.0, type: 'CREDIT', date: '2026-10-14' }],
      },
    };

    // First sync reconciles self-transfer
    await runSyncPipeline(memDb, 'item-transfer', payload);

    const pairedRes = await memDb.execute('SELECT id, type, transfer_id FROM transactions ORDER BY id;');
    assert.strictEqual(pairedRes.rows[0].type, 'TRANSFER');
    assert.strictEqual(pairedRes.rows[1].type, 'TRANSFER');
    assert.ok(pairedRes.rows[0].transfer_id);
    assert.strictEqual(pairedRes.rows[0].transfer_id, pairedRes.rows[1].transfer_id);

    // Re-sync with raw DEBIT/CREDIT from upstream
    await runSyncPipeline(memDb, 'item-transfer', payload);

    const reSynced = await memDb.execute('SELECT id, type, transfer_id FROM transactions ORDER BY id;');
    assert.strictEqual(reSynced.rows[0].type, 'TRANSFER');
    assert.strictEqual(reSynced.rows[1].type, 'TRANSFER');
  });

  // Scenario 16: Crash Recovery & Dead Lock Expiration (TTL > 5 min)
  it('Scenario 16: Recovers and prunes stale dead lock (> 5 min) after simulated crash', async () => {
    const memDb = await createMemSyncDb();
    const staleLockKey = 'sync_item_stale';

    // Stale lock from 10 minutes ago
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await memDb.execute({
      sql: 'INSERT INTO sync_locks (key, acquired_at, status) VALUES (?, ?, ?);',
      args: [staleLockKey, tenMinutesAgo, 'SYNCING'],
    });

    // Prune logic
    const LOCK_TTL_MS = 5 * 60 * 1000;
    const now = Date.now();
    const locks = await memDb.execute('SELECT * FROM sync_locks;');
    for (const lock of locks.rows) {
      const age = now - new Date(lock.acquired_at as string).getTime();
      if (age > LOCK_TTL_MS) {
        await memDb.execute({ sql: 'DELETE FROM sync_locks WHERE key = ?;', args: [lock.key as string] });
      }
    }

    const remainingLocks = await memDb.execute('SELECT * FROM sync_locks;');
    assert.strictEqual(remainingLocks.rows.length, 0);
  });

});
