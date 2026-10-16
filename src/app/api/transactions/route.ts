import { NextResponse } from 'next/server';
import { db, client, ensureDbInitialized } from '@/db';
import { transactions, accounts } from '@/db/schema';
import { normalizeTransactionValues, TransactionType } from '@/lib/transactions';
import { desc, eq } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    await ensureDbInitialized();
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const accountId = url.searchParams.get('accountId');
    const type = url.searchParams.get('type');

    const query = db.select().from(transactions).orderBy(desc(transactions.date));
    const list = await query.limit(limit);

    let filtered = list;
    if (accountId && accountId !== 'ALL') {
      filtered = filtered.filter((t) => t.accountId === accountId);
    }
    if (type && type !== 'ALL') {
      filtered = filtered.filter((t) => t.type === type);
    }

    return NextResponse.json({ transactions: filtered });
  } catch (error: unknown) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json({ error: 'Erro ao listar movimentações financeiras' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDbInitialized();
    const body = await request.json();

    const {
      accountId,
      destinationAccountId,
      categoryId,
      description,
      amount,
      date,
      type,
    } = body;

    if (!accountId || !description || amount === undefined || !date) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes (conta, descrição, valor, data)' }, { status: 400 });
    }

    // Verify source account exists
    const sourceAcc = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (sourceAcc.length === 0) {
      return NextResponse.json({ error: 'Conta de origem não encontrada' }, { status: 404 });
    }

    const rawType = (type || '').trim().toUpperCase();
    const isTransfer = rawType === 'TRANSFER' || Boolean(destinationAccountId);

    if (isTransfer) {
      if (!destinationAccountId) {
        return NextResponse.json({ error: 'Conta de destino é obrigatória para transferências' }, { status: 400 });
      }
      if (accountId === destinationAccountId) {
        return NextResponse.json({ error: 'Conta de origem e destino devem ser distintas' }, { status: 400 });
      }

      const destAcc = await db.select().from(accounts).where(eq(accounts.id, destinationAccountId)).limit(1);
      if (destAcc.length === 0) {
        return NextResponse.json({ error: 'Conta de destino não encontrada' }, { status: 404 });
      }

      const parsedNum = typeof amount === 'string' ? parseFloat(amount.replace(',', '.')) : Number(amount);
      if (isNaN(parsedNum) || parsedNum <= 0) {
        return NextResponse.json({ error: 'Valor da transferência deve ser positivo' }, { status: 400 });
      }

      const transferAmount = Math.round(parsedNum * 100) / 100;
      const transferId = `tr-manual-${Date.now()}`;
      const outId = `tx-out-${Date.now()}`;
      const inId = `tx-in-${Date.now() + 1}`;
      const now = new Date().toISOString();

      const newSourceBalance = Math.round((sourceAcc[0].balance - transferAmount) * 100) / 100;
      const newDestBalance = Math.round((destAcc[0].balance + transferAmount) * 100) / 100;

      // Atomic execution using batch (all or nothing rollback)
      await client.batch([
        {
          sql: `INSERT INTO transactions (id, account_id, category_id, description, amount, date, type, status, transfer_id, is_ignored, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'TRANSFER', 'SETTLED', ?, 0, ?);`,
          args: [outId, accountId, categoryId || null, `Transf. enviada: ${description.trim()}`, -transferAmount, date, transferId, now],
        },
        {
          sql: `INSERT INTO transactions (id, account_id, category_id, description, amount, date, type, status, transfer_id, is_ignored, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'TRANSFER', 'SETTLED', ?, 0, ?);`,
          args: [inId, destinationAccountId, categoryId || null, `Transf. recebida: ${description.trim()}`, transferAmount, date, transferId, now],
        },
        {
          sql: `UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?;`,
          args: [newSourceBalance, now, accountId],
        },
        {
          sql: `UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?;`,
          args: [newDestBalance, now, destinationAccountId],
        },
      ], 'write');

      return NextResponse.json({
        success: true,
        transferId,
        outflowId: outId,
        inflowId: inId,
        amount: transferAmount,
        type: 'TRANSFER',
        sourceAccount: { id: accountId, newBalance: newSourceBalance },
        destinationAccount: { id: destinationAccountId, newBalance: newDestBalance },
      });
    }

    // Standard Single Transaction (CREDIT or DEBIT)
    const { amount: normalizedAmount, type: normalizedType } = normalizeTransactionValues({
      amount,
      type: rawType as TransactionType,
    });

    if (isNaN(normalizedAmount)) {
      return NextResponse.json({ error: 'Valor monetário inválido' }, { status: 400 });
    }

    const txId = `tx-manual-${Date.now()}`;
    const now = new Date().toISOString();
    const newBalance = Math.round((sourceAcc[0].balance + normalizedAmount) * 100) / 100;

    // Atomic execution: insert transaction and adjust account balance in single batch
    await client.batch([
      {
        sql: `INSERT INTO transactions (id, account_id, category_id, description, amount, date, type, status, is_ignored, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'SETTLED', 0, ?);`,
        args: [txId, accountId, categoryId || null, description.trim(), normalizedAmount, date, normalizedType, now],
      },
      {
        sql: `UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?;`,
        args: [newBalance, now, accountId],
      },
    ], 'write');

    return NextResponse.json({
      success: true,
      id: txId,
      amount: normalizedAmount,
      type: normalizedType,
      account: { id: accountId, newBalance },
    });
  } catch (error: unknown) {
    console.error('Failed to create transaction:', error);
    return NextResponse.json({ error: 'Erro ao registrar movimentação financeira' }, { status: 500 });
  }
}
