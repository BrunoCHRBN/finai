import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { recurringFlows, recurringOccurrences } from '@/db/schema';
import { eq, and, inArray, gte } from 'drizzle-orm';
import { roundCurrency, safeNumeric } from '@/lib/planning-engine';
import { generateOccurrences } from '@/lib/recurring-engine';
import { handleApiError } from '@/lib/api-error';

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

    const amountType =
      typeof body.amountType === 'string' && ['FIXED', 'VARIABLE'].includes(body.amountType.trim().toUpperCase())
        ? body.amountType.trim().toUpperCase()
        : (curr.amountType || 'FIXED');

    const validFreqs = ['WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'ONCE'];
    const frequency =
      typeof body.frequency === 'string' && validFreqs.includes(body.frequency.trim().toUpperCase())
        ? body.frequency.trim().toUpperCase()
        : (curr.frequency || 'MONTHLY');

    const rawStatus =
      typeof body.status === 'string' && ['ACTIVE', 'PAUSED', 'ENDED'].includes(body.status.trim().toUpperCase())
        ? body.status.trim().toUpperCase()
        : (curr.status || 'ACTIVE');

    const isActive =
      body.isActive !== undefined
        ? body.isActive === 1 || body.isActive === true
          ? 1
          : 0
        : rawStatus === 'ACTIVE'
        ? 1
        : 0;

    const dayOfMonth =
      body.dayOfMonth !== undefined
        ? Math.min(31, Math.max(1, Math.round(safeNumeric(body.dayOfMonth, curr.dayOfMonth || 5))))
        : (curr.dayOfMonth || 5);

    const secondDayOfMonth =
      body.secondDayOfMonth !== undefined
        ? body.secondDayOfMonth != null
          ? Math.min(31, Math.max(1, Math.round(safeNumeric(body.secondDayOfMonth, 20))))
          : null
        : (curr.secondDayOfMonth ?? null);

    const startDate =
      body.startDate !== undefined
        ? typeof body.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate.trim())
          ? body.startDate.trim()
          : null
        : curr.startDate;

    const nextDate =
      body.nextDate !== undefined
        ? typeof body.nextDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.nextDate.trim())
          ? body.nextDate.trim()
          : null
        : curr.nextDate;

    const endDate =
      body.endDate !== undefined
        ? typeof body.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.endDate.trim())
          ? body.endDate.trim()
          : null
        : curr.endDate;

    const endMonth =
      body.endMonth !== undefined
        ? typeof body.endMonth === 'string' && /^\d{4}-\d{2}$/.test(body.endMonth.trim())
          ? body.endMonth.trim()
          : null
        : curr.endMonth;

    const destinationAccountId =
      body.destinationAccountId !== undefined
        ? typeof body.destinationAccountId === 'string' && body.destinationAccountId.trim()
          ? body.destinationAccountId.trim()
          : null
        : curr.destinationAccountId;

    const incomeCategory =
      body.incomeCategory !== undefined
        ? typeof body.incomeCategory === 'string' && body.incomeCategory.trim()
          ? body.incomeCategory.trim().toUpperCase()
          : null
        : curr.incomeCategory;

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
        amountType,
        frequency,
        dayOfMonth,
        secondDayOfMonth,
        startDate,
        nextDate,
        endDate,
        isActive,
        status: rawStatus,
        destinationAccountId,
        incomeCategory,
        endMonth,
        remainingInstallments,
        updatedAt: now,
      })
      .where(eq(recurringFlows.id, id));

    const todayStr = now.split('T')[0];

    // If flow is active, update future unreconciled occurrences
    if (rawStatus === 'ACTIVE') {
      // 1. Delete future pending occurrences so they are updated to the new schedule / amount
      await db
        .delete(recurringOccurrences)
        .where(
          and(
            eq(recurringOccurrences.flowId, id),
            eq(recurringOccurrences.status, 'PENDING'),
            gte(recurringOccurrences.expectedDate, todayStr)
          )
        );

      const horizonEndDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const occStartDate = startDate && startDate > todayStr ? startDate : todayStr;
      
      const newOccs = generateOccurrences(
        {
          id,
          title,
          type: type as 'INCOME' | 'EXPENSE',
          nature: nature as 'CONFIRMED' | 'ESTIMATED',
          amount,
          amountType,
          frequency: frequency as 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'ONCE',
          dayOfMonth,
          secondDayOfMonth,
          startDate: occStartDate,
          nextDate,
          endDate,
          startMonth: curr.startMonth,
          endMonth,
          remainingInstallments,
          status: rawStatus as 'ACTIVE' | 'PAUSED' | 'ENDED',
          isActive: 1,
        },
        occStartDate,
        horizonEndDate
      );

      if (newOccs.length > 0) {
        await db
          .insert(recurringOccurrences)
          .values(
            newOccs.map((o) => ({
              id: o.id,
              flowId: o.flowId,
              expectedDate: o.expectedDate,
              expectedAmount: o.expectedAmount,
              status: o.status,
              createdAt: now,
              updatedAt: now,
            }))
          )
          .onConflictDoNothing();
      }
    } else {
      // Flow is PAUSED or ENDED: prune future pending occurrences, preserving past/reconciled history
      await db
        .delete(recurringOccurrences)
        .where(
          and(
            eq(recurringOccurrences.flowId, id),
            eq(recurringOccurrences.status, 'PENDING'),
            gte(recurringOccurrences.expectedDate, todayStr)
          )
        );
    }

    return NextResponse.json({
      success: true,
      id,
      updatedAt: now,
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao atualizar fluxo recorrente.', 'recurring:[id]:PATCH');
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

    // Delete pending/overdue occurrences
    await db
      .delete(recurringOccurrences)
      .where(
        and(
          eq(recurringOccurrences.flowId, id),
          inArray(recurringOccurrences.status, ['PENDING', 'OVERDUE'])
        )
      );

    await db.delete(recurringFlows).where(eq(recurringFlows.id, id));
    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao excluir fluxo recorrente.', 'recurring:[id]:DELETE');
  }
}
