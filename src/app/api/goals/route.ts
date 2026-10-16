import { NextResponse, NextRequest } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { goals, accounts } from '@/db/schema';
import { evaluateFinancialGoals, roundCurrency, safeNumeric } from '@/lib/planning-engine';

export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();
    const month = request.nextUrl.searchParams.get('month') || '2026-10';

    const allGoals = await db.select().from(goals);
    const allAccounts = await db.select().from(accounts);

    const summary = evaluateFinancialGoals(allGoals, allAccounts, month);

    return NextResponse.json({
      month,
      goals: allGoals,
      summary,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao listar metas financeiras';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDbInitialized();
    const body = await request.json();

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return NextResponse.json({ error: 'O nome da meta é obrigatório.' }, { status: 400 });
    }

    const targetAmount = roundCurrency(safeNumeric(body.targetAmount, NaN));
    if (Number.isNaN(targetAmount) || targetAmount <= 0) {
      return NextResponse.json(
        { error: 'O valor-alvo da meta deve ser maior que zero.' },
        { status: 400 }
      );
    }

    const currentAmount = roundCurrency(Math.max(0, safeNumeric(body.currentAmount, 0)));
    const plannedMonthlyContribution = roundCurrency(
      Math.max(0, safeNumeric(body.plannedMonthlyContribution, 0))
    );
    const priority = Math.max(1, Math.round(safeNumeric(body.priority, 1)));
    const purpose = typeof body.purpose === 'string' ? body.purpose.trim() : null;
    const deadline = typeof body.deadline === 'string' && body.deadline.trim() ? body.deadline.trim() : null;
    const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim().toUpperCase() : 'EMERGENCY';
    const rawStatus = typeof body.status === 'string' ? body.status.trim().toUpperCase() : 'ACTIVE';
    const status = ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'].includes(rawStatus)
      ? rawStatus
      : 'ACTIVE';
    const linkedAccountId =
      typeof body.linkedAccountId === 'string' && body.linkedAccountId.trim()
        ? body.linkedAccountId.trim()
        : null;
    const color = typeof body.color === 'string' && body.color.trim() ? body.color.trim() : '#10b981';

    const now = new Date().toISOString();
    const id = `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    await db.insert(goals).values({
      id,
      title,
      purpose,
      targetAmount,
      currentAmount,
      plannedMonthlyContribution,
      deadline,
      category,
      status,
      priority,
      linkedAccountId,
      color,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      success: true,
      id,
      goal: {
        id,
        title,
        purpose,
        targetAmount,
        currentAmount,
        plannedMonthlyContribution,
        deadline,
        category,
        status,
        priority,
        linkedAccountId,
        color,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao criar meta financeira';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
