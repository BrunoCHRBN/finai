import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { accounts, transactions, categories, syncLocks, syncLogs } from '@/db/schema';
import { getPluggyAccounts, fetchAllPluggyTransactions, PluggyTransactionResult } from '@/lib/pluggy';
import {
  normalizeTransactionValues,
  detectAndReconcileSelfTransfers,
  isInvoicePaymentDescription,
} from '@/lib/transactions';
import { eq, isNotNull } from 'drizzle-orm';

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL for crash recovery

/**
 * Sanitizes error messages to prevent credential/token leakage
 */
function redactSensitive(msg: string): string {
  if (!msg) return '';
  return msg
    .replace(/[a-zA-Z0-9_\-]{24,}/g, '[REDACTED_TOKEN]')
    .replace(/(client[_\s-]?secret|api[_\s-]?key|authorization|bearer)[=:\s]+[^\s,]+/gi, '$1=[REDACTED]');
}

/**
 * Categorization rules engine (0 tokens)
 * Maps common Brazilian merchants/patterns to category IDs
 */
function matchCategoryByRule(description: string, allCategories: Array<{ id: string; name: string }>): string | null {
  const desc = description.toUpperCase();

  const rules: Array<{ pattern: RegExp; nameMatch: string }> = [
    { pattern: /IFOOD|UBER EATS|RAPPI|RESTAURANTE|BURGER|OUTBACK|MCDONALD|PADARIA|PIZZARIA/i, nameMatch: 'Restaurantes & Delivery' },
    { pattern: /MERCADO|SUPERMERCADO|PAO DE ACUCAR|CARREFOUR|ASSAI|ATACADAO|EXTRA/i, nameMatch: 'Supermercado & Essenciais' },
    { pattern: /UBER|99APP|99 TECNOLOGIA|POSTO|IPIRANGA|SHELL|COMBUSTIVEL|ESTAPAR/i, nameMatch: 'Transporte (Uber/Combustível)' },
    { pattern: /ENEL|CPFL|SABESP|LIGHT|VIVO|CLARO|TIM|NET SERVICOS|INTERNET/i, nameMatch: 'Contas & Serviços (Luz/Internet)' },
    { pattern: /FARMACIA|DROGASIL|DROGA RAIA|PAGUE MENOS|HOSPITAL|CONSULTORIO/i, nameMatch: 'Saúde & Farmácia' },
    { pattern: /NETFLIX|SPOTIFY|AMAZON PRIME|HBO|DISNEY|APPLE\.COM|GOOGLE STORAGE/i, nameMatch: 'Assinaturas & Softwares' },
    { pattern: /CINEMA|INGRESSO|HOTEL|BOOKING|AIRBNB|GOL LINHAS|LATAM|AZUL/i, nameMatch: 'Lazer, Viagens & Hobbies' },
    { pattern: /ALUGUEL|CONDOMINIO|QUANTO ANDAR|IMOBILIARIA/i, nameMatch: 'Moradia (Aluguel/Condomínio)' },
    { pattern: /SALARIO|FOLHA DE PAGAMENTO|TED RECEBIDA DE EMPRESA/i, nameMatch: 'Salário & Renda' },
    { pattern: /TESOURO|CDB|LCI|LCA|INVESTIMENTO|XP INVESTIMENTOS|BTG PACTUAL/i, nameMatch: 'Aportes & Investimentos' },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(desc)) {
      const found = allCategories.find((c) => c.name.toLowerCase().includes(rule.nameMatch.toLowerCase()));
      if (found) return found.id;
    }
  }

  return null;
}

/**
 * Acquires a distributed sync lock with automated stale-lock pruning (TTL = 5 min)
 */
async function acquireSyncLock(lockKey: string): Promise<boolean> {
  const now = Date.now();
  const existingLocks = await db.select().from(syncLocks);

  // Prune dead locks exceeding 5 minutes
  for (const lock of existingLocks) {
    const age = now - new Date(lock.acquiredAt).getTime();
    if (age > LOCK_TTL_MS || lock.status !== 'SYNCING') {
      await db.delete(syncLocks).where(eq(syncLocks.key, lock.key));
    }
  }

  // Check for active lock conflicts
  const activeLocks = await db.select().from(syncLocks);
  const isConflict = activeLocks.some(
    (l) => l.key === lockKey || l.key === 'sync_all_items' || (lockKey === 'sync_all_items' && l.status === 'SYNCING')
  );

  if (isConflict) {
    return false;
  }

  await db.insert(syncLocks).values({
    key: lockKey,
    acquiredAt: new Date().toISOString(),
    status: 'SYNCING',
  });

  return true;
}

/**
 * Safely releases a sync lock
 */
async function releaseSyncLock(lockKey: string): Promise<void> {
  try {
    await db.delete(syncLocks).where(eq(syncLocks.key, lockKey));
  } catch (err) {
    console.warn(`[Sync] Failed to release lock ${lockKey}:`, err);
  }
}

interface AccountSyncBundle {
  account: {
    id: string;
    type?: string;
    name?: string;
    marketingName?: string;
    balance?: number;
    currencyCode?: string;
    bankData?: { institutionName?: string };
  };
  itemId: string;
  transactions: PluggyTransactionResult[];
  isPartial: boolean;
  errorMessage?: string;
}

export async function POST(request: Request) {
  const startedAt = new Date().toISOString();
  const startTimeMs = Date.now();
  let activeLockKey: string | null = null;
  let targetItemIds: string[] = [];
  let isGlobal = false;

  try {
    await ensureDbInitialized();

    const body = await request.json().catch(() => ({}));
    const { itemId } = body;

    // 1. Resolve Target Items
    if (itemId && itemId !== 'item-pluggy-sync' && itemId !== 'all') {
      targetItemIds = [itemId];
      activeLockKey = `sync_item_${itemId}`;
    } else {
      isGlobal = true;
      activeLockKey = 'sync_all_items';
      const storedAccounts = await db
        .select({ itemId: accounts.pluggyItemId })
        .from(accounts)
        .where(isNotNull(accounts.pluggyItemId));
      targetItemIds = Array.from(
        new Set(storedAccounts.map((a) => a.itemId).filter((id): id is string => Boolean(id)))
      );

      // If no stored accounts, allow fallback to explicitly provided itemId (for initial connects or test fixtures)
      if (targetItemIds.length === 0 && itemId) {
        targetItemIds = [itemId];
      }
    }

    if (targetItemIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nenhuma conexão bancária encontrada para sincronização',
        accountsSynced: 0,
        transactionsSynced: 0,
        durationMs: Date.now() - startTimeMs,
      });
    }

    // 2. Concurrency Control: Acquire Lock
    const lockAcquired = await acquireSyncLock(activeLockKey);
    if (!lockAcquired) {
      return NextResponse.json(
        { error: 'Sincronização já em andamento para este item.' },
        { status: 409 }
      );
    }

    // 3. Phase A (I/O): Fetch data from Pluggy completely outside DB transactions
    const bundles: AccountSyncBundle[] = [];
    const warnings: string[] = [];

    for (const curItemId of targetItemIds) {
      try {
        const pluggyAccounts = await getPluggyAccounts(curItemId);
        for (const pAcc of pluggyAccounts) {
          const txFetchResult = await fetchAllPluggyTransactions({ accountId: pAcc.id });
          if (txFetchResult.isPartial && txFetchResult.errorMessage) {
            warnings.push(`Conta ${pAcc.id}: ${txFetchResult.errorMessage}`);
          }
          bundles.push({
            account: pAcc,
            itemId: curItemId,
            transactions: txFetchResult.transactions,
            isPartial: txFetchResult.isPartial,
            errorMessage: txFetchResult.errorMessage,
          });
        }
      } catch (itemErr: unknown) {
        const msg = itemErr instanceof Error ? itemErr.message : 'Falha ao consultar item Open Finance';
        warnings.push(`Item ${curItemId}: ${redactSensitive(msg)}`);
      }
    }

    // 4. Phase B (Database Persistence & Domain Invariants)
    const allCategories = await db.select().from(categories);
    const existingAccounts = await db.select().from(accounts);
    const existingAccountsMap = new Map(existingAccounts.map((a) => [a.id, a]));

    const existingTransactions = await db.select().from(transactions);
    const existingTxMap = new Map(
      existingTransactions.map((tx) => [tx.pluggyTransactionId || tx.id, tx])
    );

    let accountsSynced = 0;
    let transactionsNew = 0;
    let transactionsUpdated = 0;
    let transactionsIgnored = 0;

    for (const bundle of bundles) {
      const pAcc = bundle.account;
      const internalAccId = `pluggy-acc-${pAcc.id}`;

      let accType = 'CHECKING';
      if (pAcc.type === 'CREDIT') accType = 'CREDIT_CARD';
      else if (pAcc.type === 'SAVINGS') accType = 'SAVINGS';
      else if (pAcc.type === 'INVESTMENT') accType = 'INVESTMENT';

      const existingAcc = existingAccountsMap.get(internalAccId);
      if (existingAcc) {
        await db
          .update(accounts)
          .set({
            name: pAcc.name || pAcc.marketingName || existingAcc.name,
            balance: pAcc.balance ?? existingAcc.balance,
            type: accType,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(accounts.id, internalAccId));
      } else {
        await db.insert(accounts).values({
          id: internalAccId,
          name: pAcc.name || pAcc.marketingName || 'Conta Bancária',
          type: accType,
          balance: pAcc.balance ?? 0,
          currencyCode: pAcc.currencyCode || 'BRL',
          pluggyItemId: bundle.itemId,
          pluggyAccountId: pAcc.id,
          institutionName: pAcc.bankData?.institutionName || 'Banco Conectado',
          color: '#10b981',
          updatedAt: new Date().toISOString(),
        });
      }
      accountsSynced++;

      // Process Transactions
      for (const pTx of bundle.transactions) {
        const txId = `pluggy-tx-${pTx.id}`;
        const existingTx = existingTxMap.get(pTx.id) || existingTxMap.get(txId);

        const { amount: normalizedAmount, type: normalizedType } = normalizeTransactionValues({
          amount: pTx.amount,
          type: pTx.type,
        });

        const txDate = pTx.date ? pTx.date.split('T')[0] : new Date().toISOString().split('T')[0];
        const status = pTx.status || 'SETTLED';

        if (!existingTx) {
          // New Transaction: check for invoice payment description
          const isInvoice = isInvoicePaymentDescription(pTx.description);
          const finalType = isInvoice ? 'TRANSFER' : normalizedType;
          const transferId = isInvoice ? `tr_inv_${pTx.id.slice(0, 8)}` : null;
          const matchedCategory = matchCategoryByRule(pTx.description || '', allCategories);

          await db.insert(transactions).values({
            id: txId,
            accountId: internalAccId,
            categoryId: matchedCategory,
            description: pTx.description || 'Transação Open Finance',
            amount: normalizedAmount,
            date: txDate,
            type: finalType,
            transferId,
            status,
            isIgnored: 0,
            pluggyTransactionId: pTx.id,
            createdAt: new Date().toISOString(),
          });
          transactionsNew++;
        } else {
          // Idempotent Update: Preserve user customizations (category, isIgnored, TRANSFER status)
          if (existingTx.isIgnored === 1) {
            transactionsIgnored++;
          }

          // If transaction was reconciled/classified as TRANSFER (e.g. self-transfer or invoice), preserve TRANSFER type & direction
          let updatedType = normalizedType;
          let updatedTransferId = existingTx.transferId;
          let updatedAmount = normalizedAmount;

          if (existingTx.type === 'TRANSFER') {
            updatedType = 'TRANSFER';
            // Maintain transfer directional sign with updated absolute magnitude
            updatedAmount = existingTx.amount < 0 ? -Math.abs(normalizedAmount) : Math.abs(normalizedAmount);
          } else if (isInvoicePaymentDescription(pTx.description)) {
            updatedType = 'TRANSFER';
            updatedTransferId = existingTx.transferId || `tr_inv_${pTx.id.slice(0, 8)}`;
          }

          await db
            .update(transactions)
            .set({
              description: pTx.description || existingTx.description,
              amount: updatedAmount,
              date: txDate,
              status,
              type: updatedType,
              transferId: updatedTransferId,
            })
            .where(eq(transactions.id, existingTx.id));

          transactionsUpdated++;
        }
      }
    }

    // 5. Phase C: Deterministic Post-Sync Self-Transfer Reconciliation
    const currentAllAccounts = await db.select().from(accounts);
    const userAccountIds = new Set(currentAllAccounts.map((a) => a.id));
    const allDbTransactions = await db.select().from(transactions);

    const reconciled = detectAndReconcileSelfTransfers(allDbTransactions, userAccountIds);
    for (const recTx of reconciled) {
      const original = existingTxMap.get(recTx.pluggyTransactionId || recTx.id);
      if (original && (original.type !== recTx.type || original.transferId !== recTx.transferId)) {
        await db
          .update(transactions)
          .set({
            type: recTx.type,
            transferId: recTx.transferId,
          })
          .where(eq(transactions.id, recTx.id));
      }
    }

    // 6. Phase D: Audit Logging
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTimeMs;
    const isPartialSync = warnings.length > 0 || bundles.some((b) => b.isPartial);
    const syncStatus = isPartialSync ? 'PARTIAL' : 'SUCCESS';
    const logId = `sync_log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await db.insert(syncLogs).values({
      id: logId,
      itemId: isGlobal ? 'all' : targetItemIds[0] || 'unknown',
      status: syncStatus,
      accountsSynced,
      transactionsNew,
      transactionsUpdated,
      transactionsIgnored,
      errorMessage: warnings.length > 0 ? warnings.join('; ') : null,
      startedAt,
      completedAt,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      status: syncStatus,
      accountsSynced,
      transactionsSynced: transactionsNew + transactionsUpdated,
      transactionsNew,
      transactionsUpdated,
      transactionsIgnored,
      warnings: warnings.length > 0 ? warnings : undefined,
      durationMs,
      timestamp: completedAt,
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Falha na sincronização';
    const safeErrorMsg = redactSensitive(errorMsg);
    console.error('Error during Pluggy sync:', safeErrorMsg);

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTimeMs;

    try {
      const logId = `sync_log_${Date.now()}_err`;
      await db.insert(syncLogs).values({
        id: logId,
        itemId: isGlobal ? 'all' : targetItemIds[0] || 'unknown',
        status: 'FAILED',
        accountsSynced: 0,
        transactionsNew: 0,
        transactionsUpdated: 0,
        transactionsIgnored: 0,
        errorMessage: safeErrorMsg,
        startedAt,
        completedAt,
        durationMs,
      });
    } catch (logErr) {
      console.warn('Could not write failed sync log:', logErr);
    }

    return NextResponse.json({ error: safeErrorMsg }, { status: 500 });
  } finally {
    // 7. Always Release Distributed Lock
    if (activeLockKey) {
      await releaseSyncLock(activeLockKey);
    }
  }
}
