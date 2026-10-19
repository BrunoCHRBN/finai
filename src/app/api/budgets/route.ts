import { NextResponse, NextRequest } from 'next/server';
import { db, client, ensureDbInitialized } from '@/db';
import { categories, budgets, transactions, accounts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  prepareCanonicalTransactions,
  calculateBudgetExecution,
  roundCurrency,
  type BudgetHistoryEntry,
} from '@/lib/planning-engine';
import { handleApiError } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();
    const month = request.nextUrl.searchParams.get('month') || '2026-10';

    const allCategories = await db.select().from(categories);
    const allBudgets = await db.select().from(budgets).where(eq(budgets.month, month));
    const allAccounts = await db.select().from(accounts);
    const allTransactions = await db.select().from(transactions);

    const reconciled = prepareCanonicalTransactions(allTransactions, allAccounts);
    const execution = calculateBudgetExecution(month, allCategories, allBudgets, reconciled);

    return NextResponse.json({
      month,
      categories: allCategories,
      budgets: allBudgets,
      execution,
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao listar orçamentos.', 'budgets:GET');
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDbInitialized();
    const body = await request.json();
    const categoryId = body.categoryId;
    const month = (body.month || '2026-10').trim();
    const rawLimit = body.budgetLimit !== undefined ? body.budgetLimit : body.plannedAmount;
    const status: 'ACTIVE' | 'CLOSED' =
      body.status && String(body.status).toUpperCase() === 'CLOSED' ? 'CLOSED' : 'ACTIVE';
    const customName = typeof body.name === 'string' ? body.name.trim() : undefined;
    const note = typeof body.note === 'string' ? body.note.trim() : undefined;

    if (!categoryId || rawLimit === undefined) {
      return NextResponse.json({ error: 'categoryId and plannedAmount required' }, { status: 400 });
    }

    const numLimit = roundCurrency(Number(rawLimit));
    if (Number.isNaN(numLimit) || numLimit < 0) {
      return NextResponse.json(
        { error: 'plannedAmount must be a valid non-negative number' },
        { status: 400 }
      );
    }

    const existingCat = await db.select().from(categories).where(eq(categories.id, categoryId));
    if (existingCat.length === 0) {
      return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 });
    }

    const existingBudget = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.categoryId, categoryId), eq(budgets.month, month)));

    const now = new Date().toISOString();
    let history: BudgetHistoryEntry[] = [];
    let previousAmount = existingCat[0].budgetLimit || 0;
    let previousStatus = 'ACTIVE';

    if (existingBudget.length > 0) {
      previousAmount = existingBudget[0].plannedAmount;
      previousStatus = existingBudget[0].status || 'ACTIVE';
      try {
        const parsed = JSON.parse(existingBudget[0].historyJson || '[]');
        if (Array.isArray(parsed)) history = parsed;
      } catch {
        history = [];
      }
    }

    if (previousAmount !== numLimit || previousStatus !== status || existingBudget.length === 0) {
      history.unshift({
        timestamp: now,
        previousAmount: roundCurrency(previousAmount),
        newAmount: numLimit,
        previousStatus,
        newStatus: status,
        note: note || (status === 'CLOSED' ? 'Orçamento encerrado' : 'Ajuste de teto orçamentário'),
      });
      // Keep last 20 entries
      history = history.slice(0, 20);
    }

    const historyJson = JSON.stringify(history);
    const budgetId = existingBudget[0]?.id || `budget-${month}-${categoryId}`;
    const resolvedName = customName !== undefined ? customName : existingBudget[0]?.name || existingCat[0].name;

    // Atomic update of category default budgetLimit and period budget record
    if (existingBudget.length > 0) {
      await client.batch(
        [
          {
            sql: 'UPDATE categories SET budget_limit = ? WHERE id = ?',
            args: [status === 'ACTIVE' ? numLimit : existingCat[0].budgetLimit, categoryId],
          },
          {
            sql: 'UPDATE budgets SET name = ?, planned_amount = ?, status = ?, history_json = ?, updated_at = ? WHERE id = ?',
            args: [resolvedName, numLimit, status, historyJson, now, budgetId],
          },
        ],
        'write'
      );
    } else {
      await client.batch(
        [
          {
            sql: 'UPDATE categories SET budget_limit = ? WHERE id = ?',
            args: [status === 'ACTIVE' ? numLimit : existingCat[0].budgetLimit, categoryId],
          },
          {
            sql: 'INSERT INTO budgets (id, month, category_id, name, planned_amount, status, history_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            args: [budgetId, month, categoryId, resolvedName, numLimit, status, historyJson, now],
          },
        ],
        'write'
      );
    }

    return NextResponse.json({
      success: true,
      budgetId,
      month,
      categoryId,
      budgetLimit: numLimit,
      plannedAmount: numLimit,
      status,
      history,
      updatedAt: now,
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao atualizar orçamento.', 'budgets:PUT');
  }
}
