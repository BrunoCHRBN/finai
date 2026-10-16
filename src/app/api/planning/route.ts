import { NextResponse, NextRequest } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import {
  accounts,
  categories,
  budgets,
  transactions,
  goals,
  recurringFlows,
  patrimonialLiabilities,
  planningAlerts,
  planningPreferences,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  prepareCanonicalTransactions,
  calculateBudgetExecution,
  evaluateFinancialGoals,
  calculateCashFlowProjection,
  simulateSavingsScenarios,
  evaluatePlanningAlerts,
  buildConsultativePlanningSnapshot,
  roundCurrency,
  safeNumeric,
} from '@/lib/planning-engine';

export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();

    const month = request.nextUrl.searchParams.get('month') || '2026-10';
    const horizonMonths = Math.min(
      36,
      Math.max(1, parseInt(request.nextUrl.searchParams.get('horizon') || '6', 10) || 6)
    );

    const [
      allAccounts,
      allCategories,
      allBudgets,
      allTransactions,
      allGoals,
      allRecurring,
      allLiabilities,
      allPrefs,
      existingAlertRows,
    ] = await Promise.all([
      db.select().from(accounts),
      db.select().from(categories),
      db.select().from(budgets).where(eq(budgets.month, month)),
      db.select().from(transactions),
      db.select().from(goals),
      db.select().from(recurringFlows),
      db.select().from(patrimonialLiabilities),
      db.select().from(planningPreferences),
      db.select().from(planningAlerts),
    ]);

    const prefs = allPrefs[0] || {
      id: 'default',
      minLiquidityThreshold: 1000,
      budgetWarningPct: 80,
      budgetCriticalPct: 100,
      maxDataStalenessDays: 7,
      liabilityDueSoonDays: 7,
    };

    // 1. Canonical Reconciled Transactions
    const reconciledTransactions = prepareCanonicalTransactions(allTransactions, allAccounts);

    // 2. Category Budget Execution
    const budgetSummary = calculateBudgetExecution(
      month,
      allCategories,
      allBudgets,
      reconciledTransactions,
      prefs
    );

    // 3. Financial Goals & Capital Allocation
    const goalsSummary = evaluateFinancialGoals(allGoals, allAccounts, month);

    // 4. Prospective Cash Flow Projection
    const cashFlowProjection = calculateCashFlowProjection({
      referenceMonth: month,
      horizonMonths,
      accounts: allAccounts,
      reconciledTransactions,
      recurringFlows: allRecurring,
      liabilities: allLiabilities,
      goals: allGoals,
      minLiquidityThreshold: prefs.minLiquidityThreshold,
    });

    // 5. Default Savings & FI Simulation based on current verified reserve and planned contributions
    const defaultSimulation = simulateSavingsScenarios({
      initialCapital: Math.max(0, goalsSummary.verifiedAvailableReserve),
      monthlyContribution:
        goalsSummary.totalPlannedMonthlyContributions > 0
          ? goalsSummary.totalPlannedMonthlyContributions
          : 500,
      horizonMonths: 120, // 10 years default horizon
      annualNominalReturnPct: 10.5,
      annualInflationPct: 4.5,
      desiredMonthlyIncome: 5000,
      safeWithdrawalRatePct: 4.0,
    });

    // 6. Evaluate Deterministic Alerts & Sync with Deduplication
    const evaluatedAlerts = evaluatePlanningAlerts({
      referenceMonth: month,
      budgetSummary,
      goalsSummary,
      cashFlowProjection,
      accounts: allAccounts,
      liabilities: allLiabilities,
      preferences: prefs,
    });

    const existingByFingerprint = new Map(existingAlertRows.map((r) => [r.fingerprint, r]));
    const now = new Date().toISOString();
    const persistedAlerts: Array<{
      id: string;
      fingerprint: string;
      type: string;
      severity: string;
      title: string;
      reason: string;
      period: string;
      foundationData: Record<string, unknown>;
      status: string;
      createdAt: string;
      updatedAt: string;
    }> = [];

    for (const alert of evaluatedAlerts) {
      const existing = existingByFingerprint.get(alert.fingerprint);
      if (existing) {
        // Update reason/foundation if still active, but preserve DISMISSED status if user dismissed it
        const effectiveStatus = existing.status === 'DISMISSED' ? 'DISMISSED' : 'ACTIVE';
        if (existing.reason !== alert.reason || existing.status === 'RESOLVED') {
          await db
            .update(planningAlerts)
            .set({
              severity: alert.severity,
              title: alert.title,
              reason: alert.reason,
              foundationJson: JSON.stringify(alert.foundationData),
              status: effectiveStatus,
              updatedAt: now,
            })
            .where(eq(planningAlerts.id, existing.id));
        }
        persistedAlerts.push({
          id: existing.id,
          fingerprint: alert.fingerprint,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          reason: alert.reason,
          period: alert.period,
          foundationData: alert.foundationData,
          status: effectiveStatus,
          createdAt: existing.createdAt,
          updatedAt: now,
        });
      } else {
        const newId = `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        await db.insert(planningAlerts).values({
          id: newId,
          fingerprint: alert.fingerprint,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          reason: alert.reason,
          period: alert.period,
          foundationJson: JSON.stringify(alert.foundationData),
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        });
        persistedAlerts.push({
          id: newId,
          fingerprint: alert.fingerprint,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          reason: alert.reason,
          period: alert.period,
          foundationData: alert.foundationData,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // 7. Consultative AI Snapshot (Ready for future Gemini interpretation, 0 tokens consumed)
    const consultativeSnapshot = buildConsultativePlanningSnapshot({
      referenceMonth: month,
      budgetSummary,
      goalsSummary,
      cashFlowProjection,
      alerts: evaluatedAlerts,
    });

    return NextResponse.json({
      month,
      horizonMonths,
      preferences: prefs,
      budgetSummary,
      goalsSummary,
      cashFlowProjection,
      recurringFlows: allRecurring,
      defaultSimulation,
      alerts: persistedAlerts,
      consultativeSnapshot,
      timestamp: now,
    });
  } catch (error: unknown) {
    console.error('Error loading financial planning data:', error);
    const message =
      error instanceof Error ? error.message : 'Erro ao consolidar planejamento financeiro';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureDbInitialized();
    const body = await request.json();
    const action = (body.action || 'SIMULATE').toUpperCase();

    if (action === 'SIMULATE') {
      const result = simulateSavingsScenarios({
        initialCapital: safeNumeric(body.initialCapital, 0),
        monthlyContribution: safeNumeric(body.monthlyContribution, 0),
        horizonMonths: safeNumeric(body.horizonMonths, 120),
        annualNominalReturnPct: safeNumeric(body.annualNominalReturnPct, 10.5),
        annualInflationPct: safeNumeric(body.annualInflationPct, 4.5),
        desiredMonthlyIncome: safeNumeric(body.desiredMonthlyIncome, 0),
        safeWithdrawalRatePct: safeNumeric(body.safeWithdrawalRatePct, 4.0),
      });

      if (!result.isValid) {
        return NextResponse.json(
          { error: result.validationErrors.join(' '), result },
          { status: 400 }
        );
      }

      return NextResponse.json({ result });
    }

    if (action === 'DISMISS_ALERT' || action === 'RESTORE_ALERT') {
      const fingerprint = body.fingerprint;
      if (!fingerprint) {
        return NextResponse.json({ error: 'fingerprint is required' }, { status: 400 });
      }
      const newStatus = action === 'DISMISS_ALERT' ? 'DISMISSED' : 'ACTIVE';
      const now = new Date().toISOString();
      await db
        .update(planningAlerts)
        .set({ status: newStatus, updatedAt: now })
        .where(eq(planningAlerts.fingerprint, fingerprint));

      return NextResponse.json({ success: true, fingerprint, status: newStatus });
    }

    if (action === 'UPDATE_PREFERENCES') {
      const minLiquidityThreshold = roundCurrency(
        Math.max(0, safeNumeric(body.minLiquidityThreshold, 1000))
      );
      const budgetWarningPct = roundCurrency(
        Math.min(100, Math.max(10, safeNumeric(body.budgetWarningPct, 80)))
      );
      const budgetCriticalPct = roundCurrency(
        Math.max(budgetWarningPct, safeNumeric(body.budgetCriticalPct, 100))
      );
      const maxDataStalenessDays = Math.max(
        1,
        Math.round(safeNumeric(body.maxDataStalenessDays, 7))
      );
      const liabilityDueSoonDays = Math.max(
        1,
        Math.round(safeNumeric(body.liabilityDueSoonDays, 7))
      );
      const now = new Date().toISOString();

      const existing = await db
        .select()
        .from(planningPreferences)
        .where(eq(planningPreferences.id, 'default'));

      if (existing.length > 0) {
        await db
          .update(planningPreferences)
          .set({
            minLiquidityThreshold,
            budgetWarningPct,
            budgetCriticalPct,
            maxDataStalenessDays,
            liabilityDueSoonDays,
            updatedAt: now,
          })
          .where(eq(planningPreferences.id, 'default'));
      } else {
        await db.insert(planningPreferences).values({
          id: 'default',
          minLiquidityThreshold,
          budgetWarningPct,
          budgetCriticalPct,
          maxDataStalenessDays,
          liabilityDueSoonDays,
          updatedAt: now,
        });
      }

      return NextResponse.json({
        success: true,
        preferences: {
          id: 'default',
          minLiquidityThreshold,
          budgetWarningPct,
          budgetCriticalPct,
          maxDataStalenessDays,
          liabilityDueSoonDays,
          updatedAt: now,
        },
      });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao processar operação de planejamento';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
