import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { categories, budgets } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET() {
  try {
    await ensureDbInitialized();
    const list = await db.select().from(categories);
    return NextResponse.json({ categories: list });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao listar categorias';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDbInitialized();
    const body = await request.json();
    const categoryId = body.categoryId;
    const rawLimit = body.budgetLimit !== undefined ? body.budgetLimit : body.plannedAmount;

    if (!categoryId || rawLimit === undefined) {
      return NextResponse.json({ error: 'categoryId and budgetLimit required' }, { status: 400 });
    }

    const numLimit = Number(rawLimit);
    if (isNaN(numLimit) || numLimit < 0) {
      return NextResponse.json({ error: 'budgetLimit must be a valid non-negative number' }, { status: 400 });
    }

    // 1. Update the base category budgetLimit
    await db
      .update(categories)
      .set({ budgetLimit: numLimit })
      .where(eq(categories.id, categoryId));

    // 2. If month is provided, upsert into the budgets table as well
    if (body.month) {
      const existing = await db
        .select()
        .from(budgets)
        .where(and(eq(budgets.categoryId, categoryId), eq(budgets.month, body.month)));

      if (existing.length > 0) {
        await db
          .update(budgets)
          .set({ plannedAmount: numLimit })
          .where(eq(budgets.id, existing[0].id));
      } else {
        await db.insert(budgets).values({
          id: `budget-${body.month}-${categoryId}`,
          month: body.month,
          categoryId,
          plannedAmount: numLimit,
        });
      }
    }

    return NextResponse.json({ success: true, categoryId, budgetLimit: numLimit });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao atualizar orçamento';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
