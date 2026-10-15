import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { accounts, categories, transactions, goals, aiDiagnostics } from '@/db/schema';
import { calculateFinancialMetrics } from '@/lib/ai/math-engine';
import { buildSyntheticSnapshot } from '@/lib/ai/snapshot-compressor';
import { generateFinancialDiagnosis } from '@/lib/ai/gemini-client';

export async function POST(request: Request) {
  try {
    await ensureDbInitialized();

    const body = await request.json().catch(() => ({}));
    const month = body.month || '2026-10';

    const allAccounts = await db.select().from(accounts);
    const allCategories = await db.select().from(categories);
    const allTransactions = await db.select().from(transactions);
    const allGoals = await db.select().from(goals);

    const monthTransactions = allTransactions.filter((t) => t.date.startsWith(month));
    const categoryMap = new Map(allCategories.map((c) => [c.id, c]));

    const enrichedMonthTxs = monthTransactions.map((tx) => {
      const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
      return {
        id: tx.id,
        amount: tx.amount,
        date: tx.date,
        type: tx.type,
        categoryGroup: cat?.group || 'VARIABLE',
        categoryName: cat?.name || 'Outros',
        budgetLimit: cat?.budgetLimit || 0,
      };
    });

    // 1. Deterministic Calculation (0 tokens)
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

    // 2. Synthesize Context (< 180 tokens)
    const snapshot = buildSyntheticSnapshot(
      month,
      metrics,
      allGoals.map((g) => ({
        title: g.title,
        targetAmount: g.targetAmount,
        currentAmount: g.currentAmount,
      }))
    );

    // 3. Call Token-Efficient Gemini Engine
    const diagnosis = await generateFinancialDiagnosis(snapshot);

    // 4. Save to Database for auditability & history
    const diagnosisId = `diag-${Date.now()}`;
    await db.insert(aiDiagnostics).values({
      id: diagnosisId,
      month,
      maturityLevel: metrics.maturityLevel,
      summary: diagnosis.summary,
      syntheticSnapshot: JSON.stringify(snapshot),
      actionableSteps: JSON.stringify(diagnosis.priorityActions),
      savingsRate: metrics.savingsRatePct,
      burnRate: metrics.fixedExpenses + metrics.variableExpenses,
      runwayMonths: metrics.runwayMonths,
      tokenCount: diagnosis.tokensConsumed,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      diagnosisId,
      metrics,
      snapshot,
      diagnosis,
    });
  } catch (error: any) {
    console.error('Error generating AI diagnosis:', error);
    return NextResponse.json({ error: error.message || 'Diagnosis generation failed' }, { status: 500 });
  }
}
