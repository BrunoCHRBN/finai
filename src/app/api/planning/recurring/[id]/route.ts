import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { recurringFlows } from '@/db/schema';
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

    const existing = await db
      .select()
      .from(recurringFlows)
      .where(eq(recurringFlows.id, id));
    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Fluxo recorrente não encontrado.' },
        { status: 404 }
      );
    }

    const curr = existing[0];
    const title =
      typeof body.title === 'string' && body.title.trim() ? body.title.trim() : curr.title;
    const type =
      typeof body.type === 'string' &&
      ['INCOME', 'EXPENSE'].includes(body.type.trim().toUpperCase())
        ? body.type.trim().toUpperCase()
        : curr.type;
    const nature =
      typeof body.nature === 'string' &&
      ['CONFIRMED', 'ESTIMATED'].includes(body.nature.trim().toUpperCase())
        ? body.nature.trim().toUpperCase()
        : curr.nature;
    const amount =
      body.amount !== undefined
        ? roundCurrency(safeNumeric(body.amount, curr.amount))
        : curr.amount;
    if (amount <= 0) {
      return NextResponse.json(
        { error: 'O valor do fluxo recorrente deve ser maior que zero.' },
        { status: 400 }
      );
    }

    const isActive =
      body.isActive !== undefined
        ? body.isActive === 1 || body.isActive === true
          ? 1
          : 0
        : curr.isActive;

    const endMonth =
      body.endMonth !== undefined
        ? typeof body.endMonth === 'string' && /^\d{4}-\d{2}$/.test(body.endMonth.trim())
          ? body.endMonth.trim()
          : null
        : curr.endMonth;

    const remainingInstallments =
      body.remainingInstallments !== undefined
        ? body.remainingInstallments === null
          ? null
          : Math.max(0, Math.round(safeNumeric(body.remainingInstallments, 0)))
        : curr.remainingInstallments;

    const now = new Date().toISOString();

    await db
      .update(recurringFlows)
      .set({
        title,
        type,
        nature,
        amount,
        isActive,
        endMonth,
        remainingInstallments,
        updatedAt: now,
      })
      .where(eq(recurringFlows.id, id));

    return NextResponse.json({
      success: true,
      id,
      updatedAt: now,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Erro ao atualizar fluxo recorrente';
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

    const existing = await db
      .select()
      .from(recurringFlows)
      .where(eq(recurringFlows.id, id));
    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Fluxo recorrente não encontrado.' },
        { status: 404 }
      );
    }

    await db.delete(recurringFlows).where(eq(recurringFlows.id, id));
    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Erro ao excluir fluxo recorrente';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
