import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { goals } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { roundCurrency, safeNumeric } from '@/lib/planning-engine';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await context.params;
    const body = await request.json();

    const existing = await db.select().from(goals).where(eq(goals.id, id));
    if (existing.length === 0) {
      return NextResponse.json({ error: 'Meta financeira não encontrada.' }, { status: 404 });
    }

    const curr = existing[0];
    const title =
      typeof body.title === 'string' && body.title.trim() ? body.title.trim() : curr.title;
    const purpose =
      body.purpose !== undefined
        ? typeof body.purpose === 'string'
          ? body.purpose.trim()
          : null
        : curr.purpose;

    const targetAmount =
      body.targetAmount !== undefined
        ? roundCurrency(safeNumeric(body.targetAmount, curr.targetAmount))
        : curr.targetAmount;
    if (targetAmount <= 0) {
      return NextResponse.json(
        { error: 'O valor-alvo da meta deve ser maior que zero.' },
        { status: 400 }
      );
    }

    const currentAmount =
      body.currentAmount !== undefined
        ? roundCurrency(Math.max(0, safeNumeric(body.currentAmount, curr.currentAmount)))
        : curr.currentAmount;

    const plannedMonthlyContribution =
      body.plannedMonthlyContribution !== undefined
        ? roundCurrency(
            Math.max(
              0,
              safeNumeric(body.plannedMonthlyContribution, curr.plannedMonthlyContribution || 0)
            )
          )
        : curr.plannedMonthlyContribution || 0;

    const deadline =
      body.deadline !== undefined
        ? typeof body.deadline === 'string' && body.deadline.trim()
          ? body.deadline.trim()
          : null
        : curr.deadline;

    const category =
      typeof body.category === 'string' && body.category.trim()
        ? body.category.trim().toUpperCase()
        : curr.category;

    const rawStatus =
      typeof body.status === 'string' && body.status.trim()
        ? body.status.trim().toUpperCase()
        : curr.status || 'ACTIVE';
    const status = ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'].includes(rawStatus)
      ? rawStatus
      : curr.status || 'ACTIVE';

    const priority =
      body.priority !== undefined
        ? Math.max(1, Math.round(safeNumeric(body.priority, curr.priority || 1)))
        : curr.priority || 1;

    const linkedAccountId =
      body.linkedAccountId !== undefined
        ? typeof body.linkedAccountId === 'string' && body.linkedAccountId.trim()
          ? body.linkedAccountId.trim()
          : null
        : curr.linkedAccountId;

    const color =
      typeof body.color === 'string' && body.color.trim() ? body.color.trim() : curr.color;

    const now = new Date().toISOString();

    await db
      .update(goals)
      .set({
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
        updatedAt: now,
      })
      .where(eq(goals.id, id));

    return NextResponse.json({
      success: true,
      id,
      updatedAt: now,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao atualizar meta financeira';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await context.params;

    const existing = await db.select().from(goals).where(eq(goals.id, id));
    if (existing.length === 0) {
      return NextResponse.json({ error: 'Meta financeira não encontrada.' }, { status: 404 });
    }

    // Deleting a goal never alters bank balances or transactions
    await db.delete(goals).where(eq(goals.id, id));

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao excluir meta financeira';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
