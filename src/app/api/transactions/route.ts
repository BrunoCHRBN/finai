import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { transactions } from '@/db/schema';
import { desc } from 'drizzle-orm';


export async function GET(request: Request) {
  try {
    await ensureDbInitialized();
    const list = await db.select().from(transactions).orderBy(desc(transactions.date)).limit(100);
    return NextResponse.json({ transactions: list });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

    const id = `tx-manual-${Date.now()}`;
    await db.insert(transactions).values({
      id,
      accountId,
      categoryId: categoryId || null,
      description,
      amount: Number(amount),
      date,
      type: type || (Number(amount) < 0 ? 'DEBIT' : 'CREDIT'),
      status: 'SETTLED',
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
