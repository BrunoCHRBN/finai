import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { transactions } from '@/db/schema';
import { normalizeTransactionValues } from '@/lib/transactions';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    await ensureDbInitialized();
    const list = await db.select().from(transactions).orderBy(desc(transactions.date)).limit(100);
    return NextResponse.json({ transactions: list });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao listar transações';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDbInitialized();
    const body = await request.json();

    const { accountId, categoryId, description, amount, date, type } = body;

    if (!accountId || !description || amount === undefined || !date) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 });
    }

    const { amount: normalizedAmount, type: normalizedType } = normalizeTransactionValues({
      amount,
      type,
    });

    if (isNaN(normalizedAmount)) {
      return NextResponse.json({ error: 'Valor monetário inválido' }, { status: 400 });
    }

    const id = `tx-manual-${Date.now()}`;
    await db.insert(transactions).values({
      id,
      accountId,
      categoryId: categoryId || null,
      description: description.trim(),
      amount: normalizedAmount,
      date,
      type: normalizedType,
      status: 'SETTLED',
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, id, amount: normalizedAmount, type: normalizedType });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao registrar transação';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
