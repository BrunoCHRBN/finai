import { NextResponse, NextRequest } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { accounts, categories, transactions, goals, aiDiagnostics } from '@/db/schema';
import { calculateFinancialMetrics } from '@/lib/ai/math-engine';
import { normalizeTransactionValues } from '@/lib/transactions';
import { desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();

    const month = request.nextUrl.searchParams.get('month') || '2026-10';

    const allAccounts = await db.select().from(accounts);
    const allCategories = await db.select().from(categories);
    const allTransactions = await db.select().from(transactions).orderBy(desc(transactions.date));
    const allGoals = await db.select().from(goals);
    
    // Get latest AI diagnostic for this month
    const diagnosticsList = await db
      .select()
      .from(aiDiagnostics)
      .orderBy(desc(aiDiagnostics.createdAt))
      .limit(1);

    // Normalize all transactions using canonical convention
    const normalizedTransactions = allTransactions.map((tx) => {
      const { amount: normAmount, type: normType } = normalizeTransactionValues({
        amount: tx.amount,
        type: tx.type,
      });
      return {
        ...tx,
        amount: normAmount,
        type: normType,
      };
    });

    // Filter transactions for the requested month
    const monthTransactions = normalizedTransactions.filter((t) => t.date.startsWith(month));

    // Enrich transactions with category info
    const categoryMap = new Map(allCategories.map((c) => [c.id, c]));
    const accountMap = new Map(allAccounts.map((a) => [a.id, a]));

    const enrichedMonthTxs = monthTransactions.map((tx) => {
      const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
      return {
        id: tx.id,
        amount: tx.amount,
        date: tx.date,
        type: tx.type,
        categoryGroup: cat?.group || 'VARIABLE',
        categoryName: cat?.name || 'Não Categorizado',
        budgetLimit: cat?.budgetLimit || 0,
      };
    });

    // Run deterministic calculation (0 tokens)
    const metrics = calculateFinancialMetrics(
      enrichedMonthTxs,
      allAccounts.map((a) => ({ id: a.id, type: a.type, balance: a.balance })),
      allCategories.map((c) => ({
        id: c.id,
        name: c.name,
        group: c.group,
        budgetLimit: c.budgetLimit,
      }))
    );

    return NextResponse.json({
      month,
      metrics,
      accounts: allAccounts,
      categories: allCategories,
      transactions: normalizedTransactions.map((t) => ({
        ...t,
        category: t.categoryId ? categoryMap.get(t.categoryId) : null,
        account: accountMap.get(t.accountId),
      })),
      goals: allGoals,
      latestDiagnosis: diagnosticsList[0] || null,
    });
  } catch (error: any) {
    console.error('Failed to get financial summary:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
