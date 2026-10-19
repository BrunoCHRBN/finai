import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { recurringFlows, recurringOccurrences } from '@/db/schema';
import { roundCurrency, safeNumeric } from '@/lib/planning-engine';
import { generateOccurrences } from '@/lib/recurring-engine';
import { desc } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

export async function GET() {
  try {
    await ensureDbInitialized();
    const list = await db
      .select()
      .from(recurringFlows)
      .orderBy(desc(recurringFlows.createdAt));
    return NextResponse.json({ recurringFlows: list });
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao listar compromissos e fluxos recorrentes.', 'recurring:GET');
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
    const validFreqs = ['WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'ONCE'];
    const frequency = validFreqs.includes(rawFreq) ? rawFreq : 'MONTHLY';

    const rawAmountType =
      typeof body.amountType === 'string' ? body.amountType.trim().toUpperCase() : 'FIXED';
    const amountType = rawAmountType === 'VARIABLE' ? 'VARIABLE' : 'FIXED';

    const rawStatus =
      typeof body.status === 'string' ? body.status.trim().toUpperCase() : 'ACTIVE';
    const status = ['ACTIVE', 'PAUSED', 'ENDED'].includes(rawStatus) ? rawStatus : 'ACTIVE';

    const dayOfMonth = Math.min(31, Math.max(1, Math.round(safeNumeric(body.dayOfMonth, 5))));
    const secondDayOfMonth =
      body.secondDayOfMonth != null
        ? Math.min(31, Math.max(1, Math.round(safeNumeric(body.secondDayOfMonth, 20))))
        : null;

    const startDate =
      typeof body.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate.trim())
        ? body.startDate.trim()
        : null;

    const nextDate =
      typeof body.nextDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.nextDate.trim())
        ? body.nextDate.trim()
        : null;

    const endDate =
      typeof body.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.endDate.trim())
        ? body.endDate.trim()
        : null;

    const startMonth =
      typeof body.startMonth === 'string' && /^\d{4}-\d{2}$/.test(body.startMonth.trim())
        ? body.startMonth.trim()
        : (startDate ? startDate.slice(0, 7) : '2026-10');

    const endMonth =
      typeof body.endMonth === 'string' && /^\d{4}-\d{2}$/.test(body.endMonth.trim())
        ? body.endMonth.trim()
        : (endDate ? endDate.slice(0, 7) : null);

    const destinationAccountId =
      typeof body.destinationAccountId === 'string' && body.destinationAccountId.trim()
        ? body.destinationAccountId.trim()
        : null;

    const incomeCategory =
      typeof body.incomeCategory === 'string' && body.incomeCategory.trim()
        ? body.incomeCategory.trim().toUpperCase()
        : null;

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
      amountType,
      frequency,
      dayOfMonth,
      secondDayOfMonth,
      startDate,
      nextDate,
      endDate,
      startMonth,
      endMonth,
      totalInstallments,
      remainingInstallments,
      status,
      destinationAccountId,
      incomeCategory,
      isActive: status === 'ACTIVE' ? 1 : 0,
      notes,
      createdAt: now,
      updatedAt: now,
    });

    // Generate upcoming occurrences for the next 180 days
    const horizonEndDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const occStartDate = startDate || `${startMonth}-${String(dayOfMonth).padStart(2, '0')}`;
    const generatedOccs = generateOccurrences(
      {
        id,
        title,
        type: rawType as 'INCOME' | 'EXPENSE',
        nature: nature as 'CONFIRMED' | 'ESTIMATED',
        amount,
        amountType,
        frequency: frequency as 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'ONCE',
        dayOfMonth,
        secondDayOfMonth,
        startDate: occStartDate,
        nextDate,
        endDate,
        startMonth,
        endMonth,
        totalInstallments,
        remainingInstallments,
        status: status as 'ACTIVE' | 'PAUSED' | 'ENDED',
        isActive: status === 'ACTIVE' ? 1 : 0,
      },
      occStartDate,
      horizonEndDate
    );

    if (generatedOccs.length > 0) {
      await db
        .insert(recurringOccurrences)
        .values(
          generatedOccs.map((o) => ({
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
        amountType,
        frequency,
        dayOfMonth,
        startDate,
        nextDate,
        endDate,
        startMonth,
        endMonth,
        totalInstallments,
        remainingInstallments,
        status,
        destinationAccountId,
        incomeCategory,
        isActive: status === 'ACTIVE' ? 1 : 0,
        notes,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao criar fluxo recorrente ou programado.', 'recurring:POST');
  }
}
