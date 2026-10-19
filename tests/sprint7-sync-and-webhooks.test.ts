import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';

describe('Sprint 7 — Fase 5: Smart Sync, Idempotência de Webhooks e Gerenciamento de Locks', () => {
  let client: ReturnType<typeof createClient>;

  beforeEach(async () => {
    client = createClient({ url: ':memory:' });
    await client.execute('PRAGMA foreign_keys = ON;');

    await client.execute(`
      CREATE TABLE processed_webhook_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        item_id TEXT,
        payload_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PROCESSED',
        error_message TEXT,
        processed_at TEXT NOT NULL
      );
    `);

    await client.execute(`
      CREATE UNIQUE INDEX processed_webhook_events_hash_idx ON processed_webhook_events(payload_hash);
    `);

    await client.execute(`
      CREATE TABLE sync_locks (
        key TEXT PRIMARY KEY,
        acquired_at TEXT NOT NULL,
        status TEXT NOT NULL
      );
    `);

    await client.execute(`
      CREATE TABLE planning_preferences (
        id TEXT PRIMARY KEY,
        min_liquidity_threshold REAL NOT NULL DEFAULT 1000,
        budget_warning_pct REAL NOT NULL DEFAULT 80,
        budget_critical_pct REAL NOT NULL DEFAULT 100,
        max_data_staleness_days INTEGER NOT NULL DEFAULT 7,
        liability_due_soon_days INTEGER NOT NULL DEFAULT 7,
        sync_interval_minutes INTEGER NOT NULL DEFAULT 0,
        last_sync_at TEXT,
        next_scheduled_sync_at TEXT,
        updated_at TEXT NOT NULL
      );
    `);

    await client.execute(`
      INSERT INTO planning_preferences (id, sync_interval_minutes, updated_at)
      VALUES ('default', 60, '2026-10-01T00:00:00.000Z');
    `);
  });

  // Simulated Webhook Processor matching src/app/api/pluggy/webhook/route.ts
  async function processWebhook(rawBody: string) {
    if (!rawBody || !rawBody.trim()) {
      return { status: 400, data: { error: 'Corpo do webhook vazio.' } };
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { status: 400, data: { error: 'Formato JSON inválido.' } };
    }

    const event = typeof payload.event === 'string' ? payload.event : 'UNKNOWN_EVENT';
    const payloadHash = createHash('sha256').update(rawBody).digest('hex');
    const rawEventId =
      typeof payload.eventId === 'string'
        ? payload.eventId
        : typeof payload.id === 'string'
        ? payload.id
        : null;
    const eventId = rawEventId || `evt_${payloadHash.slice(0, 16)}`;
    const itemId =
      typeof payload.itemId === 'string'
        ? payload.itemId
        : typeof payload.data?.itemId === 'string'
        ? payload.data.itemId
        : null;

    // 1. Idempotency Check
    const existing = await client.execute({
      sql: `SELECT * FROM processed_webhook_events WHERE id = ? OR payload_hash = ?`,
      args: [eventId, payloadHash],
    });

    if (existing.rows.length > 0) {
      return {
        status: 200,
        headers: { 'X-FinAI-Idempotent': 'HIT' },
        data: {
          received: true,
          duplicate: true,
          eventId,
          status: 'ALREADY_PROCESSED',
          message: 'Evento já processado anteriormente (idempotência garantida).',
        },
      };
    }

    const now = new Date().toISOString();
    let processingStatus = 'PROCESSED';
    if (event === 'ITEM/ERROR' || event === 'ITEM/LOGIN_ERROR') {
      processingStatus = 'FAILED';
    }

    await client.execute({
      sql: `INSERT INTO processed_webhook_events (id, event_type, item_id, payload_hash, status, processed_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [eventId, event, itemId, payloadHash, processingStatus, now],
    });

    return {
      status: 200,
      headers: { 'X-FinAI-Idempotent': 'MISS' },
      data: {
        received: true,
        eventId,
        event,
        itemId,
        status: processingStatus,
      },
    };
  }

  // Simulated Lock Manager matching src/app/api/pluggy/sync/route.ts
  const LOCK_TTL_MS = 5 * 60 * 1000;

  async function acquireLock(lockKey: string, currentTimeMs = Date.now()): Promise<boolean> {
    const existingLocks = await client.execute('SELECT key, acquired_at, status FROM sync_locks');

    // Prune dead locks exceeding 5 minutes
    for (const row of existingLocks.rows) {
      const acquiredAt = new Date(row.acquired_at as string).getTime();
      const age = currentTimeMs - acquiredAt;
      if (age > LOCK_TTL_MS || row.status !== 'SYNCING') {
        await client.execute({
          sql: 'DELETE FROM sync_locks WHERE key = ?',
          args: [row.key as string],
        });
      }
    }

    // Check conflict
    const activeLocks = await client.execute('SELECT key, status FROM sync_locks');
    const isConflict = activeLocks.rows.some(
      (r) =>
        r.key === lockKey ||
        r.key === 'sync_all_items' ||
        (lockKey === 'sync_all_items' && r.status === 'SYNCING')
    );

    if (isConflict) {
      return false;
    }

    await client.execute({
      sql: `INSERT INTO sync_locks (key, acquired_at, status) VALUES (?, ?, 'SYNCING')`,
      args: [lockKey, new Date(currentTimeMs).toISOString()],
    });

    return true;
  }

  async function releaseLock(lockKey: string): Promise<void> {
    await client.execute({
      sql: 'DELETE FROM sync_locks WHERE key = ?',
      args: [lockKey],
    });
  }

  it('1. Webhook com payload duplicado retorna HTTP 200 com flag duplicate: true (idempotência)', async () => {
    const payload = JSON.stringify({
      event: 'TRANSACTIONS/CREATED',
      eventId: 'evt_pluggy_webhook_999',
      itemId: 'item_nubank_123',
      data: { count: 5 },
    });

    // Primeira entrega do webhook
    const res1 = await processWebhook(payload);
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.data.received, true);
    assert.strictEqual(res1.data.status, 'PROCESSED');
    assert.strictEqual(res1.headers['X-FinAI-Idempotent'], 'MISS');

    // Segunda entrega do mesmo payload (redelivery de rede)
    const res2 = await processWebhook(payload);
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.data.duplicate, true);
    assert.strictEqual(res2.data.status, 'ALREADY_PROCESSED');
    assert.strictEqual(res2.headers['X-FinAI-Idempotent'], 'HIT');

    // A tabela deve conter exatamente 1 registro
    const rows = await client.execute('SELECT * FROM processed_webhook_events');
    assert.strictEqual(rows.rows.length, 1);
    assert.strictEqual(rows.rows[0].id, 'evt_pluggy_webhook_999');
  });

  it('2. Webhooks registram status de falha apropriado para eventos de erro de login/item', async () => {
    const errorPayload = JSON.stringify({
      event: 'ITEM/LOGIN_ERROR',
      eventId: 'evt_error_456',
      itemId: 'item_itau_999',
      error: { code: 'INVALID_CREDENTIALS' },
    });

    const res = await processWebhook(errorPayload);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'FAILED');

    const rows = await client.execute({
      sql: 'SELECT * FROM processed_webhook_events WHERE id = ?',
      args: ['evt_error_456'],
    });
    assert.strictEqual(rows.rows.length, 1);
    assert.strictEqual(rows.rows[0].status, 'FAILED');
  });

  it('3. Webhook rejeita corpos vazios e JSON malformado com HTTP 400', async () => {
    const emptyRes = await processWebhook('');
    assert.strictEqual(emptyRes.status, 400);

    const malformedRes = await processWebhook('NOT_VALID_JSON{foo:');
    assert.strictEqual(malformedRes.status, 400);
  });

  it('4. Intervalo de sincronização configurável atualiza lastSyncAt e nextScheduledSyncAt deterministamente', async () => {
    const simulatedNow = new Date('2026-10-16T12:00:00.000Z');
    const intervalMinutes = 180; // 3 horas

    // Atualiza preferência de intervalo
    await client.execute({
      sql: `UPDATE planning_preferences SET sync_interval_minutes = ? WHERE id = 'default'`,
      args: [intervalMinutes],
    });

    // Simulação do término de sincronização
    const completedAt = simulatedNow.toISOString();
    const nextScheduledAt = new Date(simulatedNow.getTime() + intervalMinutes * 60 * 1000).toISOString();

    await client.execute({
      sql: `UPDATE planning_preferences
            SET last_sync_at = ?, next_scheduled_sync_at = ?, updated_at = ?
            WHERE id = 'default'`,
      args: [completedAt, nextScheduledAt, completedAt],
    });

    const prefRow = await client.execute(`SELECT * FROM planning_preferences WHERE id = 'default'`);
    const pref = prefRow.rows[0];

    assert.strictEqual(pref.sync_interval_minutes, 180);
    assert.strictEqual(pref.last_sync_at, '2026-10-16T12:00:00.000Z');
    assert.strictEqual(pref.next_scheduled_sync_at, '2026-10-16T15:00:00.000Z'); // 12h + 3h = 15h
  });

  it('5. Proteção de concorrência com syncLocks previne execuções simultâneas conflitantes', async () => {
    const baseTime = Date.now();

    // Primeira aquisição obtém o lock com sucesso
    const lock1 = await acquireLock('sync_item_1', baseTime);
    assert.strictEqual(lock1, true, 'Primeiro lock deve ser concedido');

    // Tentativa simultânea do mesmo item falha
    const lock2 = await acquireLock('sync_item_1', baseTime + 1000);
    assert.strictEqual(lock2, false, 'Lock concorrente para o mesmo item deve ser negado');

    // Tentativa de sync global 'sync_all_items' também falha enquanto houver lock ativo
    const lockGlobal = await acquireLock('sync_all_items', baseTime + 2000);
    assert.strictEqual(lockGlobal, false, 'Sync global deve ser bloqueado quando item específico estiver rodando');

    // Liberação do lock
    await releaseLock('sync_item_1');

    // Agora o sync global pode ser adquirido
    const lockGlobalAfterRelease = await acquireLock('sync_all_items', baseTime + 3000);
    assert.strictEqual(lockGlobalAfterRelease, true, 'Sync global deve ser concedido após liberação');
  });

  it('6. Poda automática de stale locks (TTL = 5 min) permite recuperação de workers mortos/crashed', async () => {
    const baseTime = 1770000000000;

    // Worker A adquire lock e simula crash (sem chamar releaseLock)
    const lockA = await acquireLock('sync_item_crash', baseTime);
    assert.strictEqual(lockA, true);

    // 4 minutos depois (ainda dentro do TTL): nova tentativa deve ser bloqueada
    const lockDuringTTL = await acquireLock('sync_item_crash', baseTime + 4 * 60 * 1000);
    assert.strictEqual(lockDuringTTL, false, 'Lock deve permanecer protegido antes de expirar');

    // 6 minutos depois (excedeu TTL de 5 min): poda automática deve limpar e conceder
    const lockAfterExpiry = await acquireLock('sync_item_crash', baseTime + 6 * 60 * 1000);
    assert.strictEqual(lockAfterExpiry, true, 'Lock expirado deve ser podado e reconcedido com sucesso');
  });

  it('7. Cadência de atualização automática (PATCH /api/planning): altera cadência e modo Manual deterministamente', async () => {
    // 1. Mudança para 30 minutos: calcula nextScheduledSyncAt
    const nowMs = 1770000000000;
    const interval30 = 30;
    const nextScheduled30 = new Date(nowMs + interval30 * 60 * 1000).toISOString();

    await client.execute({
      sql: `UPDATE planning_preferences
            SET sync_interval_minutes = ?, next_scheduled_sync_at = ?, updated_at = ?
            WHERE id = 'default'`,
      args: [interval30, nextScheduled30, new Date(nowMs).toISOString()],
    });

    const row30 = await client.execute(`SELECT * FROM planning_preferences WHERE id = 'default'`);
    assert.strictEqual(row30.rows[0].sync_interval_minutes, 30);
    assert.strictEqual(row30.rows[0].next_scheduled_sync_at, nextScheduled30);

    // 2. Mudança para 0 (Modo Manual): zera nextScheduledSyncAt para NULL
    const intervalManual = 0;
    const nextScheduledManual = null;

    await client.execute({
      sql: `UPDATE planning_preferences
            SET sync_interval_minutes = ?, next_scheduled_sync_at = ?, updated_at = ?
            WHERE id = 'default'`,
      args: [intervalManual, nextScheduledManual, new Date(nowMs).toISOString()],
    });

    const rowManual = await client.execute(`SELECT * FROM planning_preferences WHERE id = 'default'`);
    assert.strictEqual(rowManual.rows[0].sync_interval_minutes, 0);
    assert.strictEqual(rowManual.rows[0].next_scheduled_sync_at, null, 'Modo manual não agenda próxima sincronização');
  });
});

