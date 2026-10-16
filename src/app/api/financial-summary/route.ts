import { NextResponse, NextRequest } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { accounts, categories, budgets, transactions, goals, aiDiagnostics } from '@/db/schema';
import { calculateFinancialMetrics } from '@/lib/ai/math-engine';
import { 
  normalizeTransactionValues, 
  detectAndReconcileSelfTransfers, 
  isInvoicePaymentDescription 
} from '@/lib/transactions';
import { desc, eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();

    const month = request.nextUrl.searchParams.get('month') || '2026-10';

    const allAccounts = await db.select().from(accounts);
    const allCategories = await db.select().from(categories);
    const periodBudgets = await db.select().from(budgets).where(eq(budgets.month, month));
    const allTransactions = await db.select().from(transactions).orderBy(desc(transactions.date));
    const allGoals = await db.select().from(goals);
    
    // Get latest AI diagnostic for this month
    const diagnosticsList = await db
      .select()
      .from(aiDiagnostics)
      .orderBy(desc(aiDiagnostics.createdAt))
      .limit(1);

    // 1. Normalize all transactions using canonical domain convention
    const normalizedTransactions = allTransactions.map((tx) => {
      const { amount: normAmount, type: normType, isIgnored: normIgnored, transferId: normTransferId } = normalizeTransactionValues({
        amount: tx.amount,
        type: tx.type,
        isIgnored: tx.isIgnored,
        transferId: tx.transferId,
      });

      let finalType = normType;
      // Reconcile invoice payments on checking or credit card accounts to prevent double counting
      if (isInvoicePaymentDescription(tx.description)) {
        finalType = 'TRANSFER';
      }

      return {
        ...tx,
        amount: normAmount,
        type: finalType,
        isIgnored: normIgnored,
        transferId: normTransferId,
      };
    });

    // 2. Reconcile Self-Transfers between user's own accounts
    const userAccountIds = new Set(allAccounts.map((a) => a.id));
    const reconciledTransactions = detectAndReconcileSelfTransfers(normalizedTransactions, userAccountIds);

    // 3. Filter transactions for the requested month and previous month
    const [yearStr, monthStr] = month.split('-');
    const yearNum = parseInt(yearStr, 10) || 2026;
    const monthNum = parseInt(monthStr, 10) || 10;
    const prevMonthDate = new Date(Date.UTC(yearNum, monthNum - 2, 1));
    const previousMonth = `${prevMonthDate.getUTCFullYear()}-${String(
      prevMonthDate.getUTCMonth() + 1
    ).padStart(2, '0')}`;

    const monthTransactions = reconciledTransactions.filter((t) => t.date.startsWith(month));
    const prevMonthTransactions = reconciledTransactions.filter((t) => t.date.startsWith(previousMonth));

    // 4. Enrich transactions with category info and period budget
    const periodBudgetMap = new Map(periodBudgets.map((b) => [b.categoryId, b]));
    const categoriesWithEffectiveLimits = allCategories.map((c) => {
      const pb = periodBudgetMap.get(c.id);
      const isClosed = pb?.status === 'CLOSED';
      const effectiveLimit = isClosed ? 0 : pb !== undefined ? pb.plannedAmount : c.budgetLimit;
      return {
        ...c,
        budgetLimit: effectiveLimit,
        periodBudgetStatus: pb?.status || 'ACTIVE',
      };
    });

    const categoryMap = new Map(categoriesWithEffectiveLimits.map((c) => [c.id, c]));
    const accountMap = new Map(allAccounts.map((a) => [a.id, a]));

    const enrichTx = (tx: (typeof reconciledTransactions)[number]) => {
      const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
      const acc = tx.accountId ? accountMap.get(tx.accountId) : undefined;
      return {
        id: tx.id,
        description: tx.description,
        amount: tx.amount,
        date: tx.date,
        type: tx.type,
        isIgnored: tx.isIgnored,
        transferId: tx.transferId,
        accountId: tx.accountId,
        accountType: acc?.type || 'CHECKING',
        categoryGroup: cat?.group || 'VARIABLE',
        categoryName: cat?.name || 'Não Categorizado',
        budgetLimit: cat?.budgetLimit || 0,
      };
    };

    const enrichedMonthTxs = monthTransactions.map(enrichTx);
    const enrichedPrevMonthTxs = prevMonthTransactions.map(enrichTx);

    // 5. Run deterministic calculation (0 tokens)
    const metrics = calculateFinancialMetrics(
      enrichedMonthTxs,
      allAccounts.map((a) => ({ id: a.id, type: a.type, balance: a.balance })),
      categoriesWithEffectiveLimits.map((c) => ({
        id: c.id,
        name: c.name,
        group: c.group,
        budgetLimit: c.budgetLimit,
      })),
      enrichedPrevMonthTxs
    );

    return NextResponse.json({
      month,
      metrics,
      accounts: allAccounts,
      categories: categoriesWithEffectiveLimits,
      budgets: periodBudgets,
      transactions: reconciledTransactions.map((t) => ({
        ...t,
        category: t.categoryId ? categoryMap.get(t.categoryId) : null,
        account: accountMap.get(t.accountId),
      })),
      goals: allGoals,
      latestDiagnosis: diagnosticsList[0] || null,
    });
  } catch (error: unknown) {
    console.error('Failed to get financial summary:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
