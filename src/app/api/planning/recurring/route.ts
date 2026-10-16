import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { recurringFlows } from '@/db/schema';
import { roundCurrency, safeNumeric } from '@/lib/planning-engine';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    await ensureDbInitialized();
    const list = await db
      .select()
      .from(recurringFlows)
      .orderBy(desc(recurringFlows.createdAt));
    return NextResponse.json({ recurringFlows: list });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Erro ao listar compromissos e fluxos recorrentes';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDbInitialized();
    const body = await request.json();

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return NextResponse.json(
        { error: 'A descrição do fluxo recorrente é obrigatória.' },
        { status: 400 }
      );
    }

    const rawType = typeof body.type === 'string' ? body.type.trim().toUpperCase() : '';
    if (rawType !== 'INCOME' && rawType !== 'EXPENSE') {
      return NextResponse.json(
        { error: 'O tipo deve ser INCOME (Receita) ou EXPENSE (Despesa).' },
        { status: 400 }
      );
    }

    const amount = roundCurrency(safeNumeric(body.amount, NaN));
    if (Number.isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'O valor do fluxo recorrente deve ser maior que zero.' },
        { status: 400 }
      );
    }

    const rawNature =
      typeof body.nature === 'string' ? body.nature.trim().toUpperCase() : 'CONFIRMED';
    const nature = rawNature === 'ESTIMATED' ? 'ESTIMATED' : 'CONFIRMED';

    const rawFreq =
      typeof body.frequency === 'string' ? body.frequency.trim().toUpperCase() : 'MONTHLY';
    const frequency = rawFreq === 'ONCE' ? 'ONCE' : 'MONTHLY';

    const startMonth =
      typeof body.startMonth === 'string' && /^\d{4}-\d{2}$/.test(body.startMonth.trim())
        ? body.startMonth.trim()
        : '2026-10';

    const endMonth =
      typeof body.endMonth === 'string' && /^\d{4}-\d{2}$/.test(body.endMonth.trim())
        ? body.endMonth.trim()
        : null;

    const dayOfMonth = Math.min(31, Math.max(1, Math.round(safeNumeric(body.dayOfMonth, 5))));
    const categoryId =
      typeof body.categoryId === 'string' && body.categoryId.trim() ? body.categoryId.trim() : null;

    const totalInstallments =
      body.totalInstallments !== undefined && body.totalInstallments !== null && body.totalInstallments !== ''
        ? Math.max(1, Math.round(safeNumeric(body.totalInstallments, 1)))
        : null;

    const remainingInstallments =
      body.remainingInstallments !== undefined &&
      body.remainingInstallments !== null &&
      body.remainingInstallments !== ''
        ? Math.max(0, Math.round(safeNumeric(body.remainingInstallments, totalInstallments || 1)))
        : totalInstallments;

    const notes = typeof body.notes === 'string' ? body.notes.trim() : null;
    const now = new Date().toISOString();
    const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    await db.insert(recurringFlows).values({
      id,
      title,
      type: rawType,
      nature,
      categoryId,
      amount,
      frequency,
      dayOfMonth,
      startMonth,
      endMonth,
      totalInstallments,
      remainingInstallments,
      isActive: 1,
      notes,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      success: true,
      id,
      recurringFlow: {
        id,
        title,
        type: rawType,
        nature,
        categoryId,
        amount,
        frequency,
        dayOfMonth,
        startMonth,
        endMonth,
        totalInstallments,
        remainingInstallments,
        isActive: 1,
        notes,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Erro ao criar fluxo recorrente ou programado';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
