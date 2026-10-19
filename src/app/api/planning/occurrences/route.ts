import { NextResponse, NextRequest } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { recurringOccurrences, recurringFlows, transactions, accounts } from '@/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';
import {
  deriveOccurrenceStatus,
  evaluateReconciliation,
  detectAmbiguousMatches,
  type RecurringOccurrenceRecord,
  type OccurrenceStatus,
} from '@/lib/recurring-engine';

export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get('start') || undefined;
    const endDate = searchParams.get('end') || undefined;
    const flowId = searchParams.get('flowId') || undefined;
    const statusFilter = searchParams.get('status') || undefined;

    const [allOccs, allFlows, allTx, allAccounts] = await Promise.all([
      db.select().from(recurringOccurrences).orderBy(desc(recurringOccurrences.expectedDate)),
      db.select().from(recurringFlows),
      db.select().from(transactions),
      db.select().from(accounts),
    ]);

    const flowMap = new Map(allFlows.map((f) => [f.id, f]));
    const todayStr = new Date().toISOString().split('T')[0];

    // Filter occurrences according to parameters
    let filtered = allOccs;
    if (flowId) {
      filtered = filtered.filter((o) => o.flowId === flowId);
    }
    if (startDate) {
      filtered = filtered.filter((o) => o.expectedDate >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter((o) => o.expectedDate <= endDate);
    }
    if (statusFilter) {
      filtered = filtered.filter((o) => o.status === statusFilter);
    }

    // Collect IDs of transactions already reconciled to an occurrence
    const alreadyReconciledTxIds = new Set(
      allOccs
        .filter((o) => o.status === 'RECONCILED' && o.transactionId)
        .map((o) => o.transactionId as string)
    );

    // Prepare eligible transactions for reconciliation matching
    // Eligible: not ignored, non-transfer, valid date, not already reconciled to an occurrence
    const eligibleTransactions = allTx
      .filter((t) => !t.isIgnored && t.type !== 'TRANSFER' && t.date && !alreadyReconciledTxIds.has(t.id))
      .map((t) => ({
        id: t.id,
        amount: Number(t.amount) || 0,
        type: (t.type || (Number(t.amount) >= 0 ? 'CREDIT' : 'DEBIT')).toUpperCase() as 'CREDIT' | 'DEBIT',
        date: t.date,
        description: t.description || '',
        accountId: t.accountId,
        isIgnored: Boolean(t.isIgnored),
        transferId: t.transferId || null,
      }));

    // Build enriched occurrences with derived status and candidate matches
    const enrichedOccurrences = filtered.map((occ) => {
      const flow = flowMap.get(occ.flowId);
      const derivedStatus = deriveOccurrenceStatus(
        {
          expectedDate: occ.expectedDate,
          status: occ.status as OccurrenceStatus,
          transactionId: occ.transactionId,
        },
        todayStr
      );

      const occRecord: RecurringOccurrenceRecord = {
        id: occ.id,
        flowId: occ.flowId,
        expectedDate: occ.expectedDate,
        expectedAmount: Number(occ.expectedAmount) || 0,
        status: derivedStatus,
        transactionId: occ.transactionId || null,
        reconciledAmount: occ.reconciledAmount ? Number(occ.reconciledAmount) : null,
        reconciledAt: occ.reconciledAt || null,
        confidenceScore: occ.confidenceScore ? Number(occ.confidenceScore) : null,
        notes: occ.notes || null,
      };

      // If pending or overdue, look for candidate transaction matches
      let evaluation: ReturnType<typeof evaluateReconciliation> | null = null;

      if ((derivedStatus === 'PENDING' || derivedStatus === 'OVERDUE') && flow) {
        evaluation = evaluateReconciliation(
          occRecord,
          {
            id: flow.id,
            title: flow.title,
            type: (flow.type || 'EXPENSE').toUpperCase() as 'INCOME' | 'EXPENSE',
            nature: (flow.nature || 'CONFIRMED').toUpperCase() as 'CONFIRMED' | 'ESTIMATED',
            amount: Number(flow.amount) || 0,
            amountType: (flow.amountType || 'FIXED').toUpperCase() as 'FIXED' | 'VARIABLE',
            frequency: (flow.frequency || 'MONTHLY').toUpperCase() as any,
            dayOfMonth: flow.dayOfMonth || 5,
            startDate: flow.startDate || null,
            nextDate: flow.nextDate || null,
            endDate: flow.endDate || null,
            startMonth: flow.startMonth,
            endMonth: flow.endMonth || null,
            totalInstallments: flow.totalInstallments || null,
            remainingInstallments: flow.remainingInstallments || null,
            isActive: Boolean(flow.isActive),
            status: (flow.status || 'ACTIVE').toUpperCase() as any,
            destinationAccountId: flow.destinationAccountId || null,
            incomeCategory: flow.incomeCategory || null,
          },
          eligibleTransactions
        );
      }

      return {
        ...occ,
        status: derivedStatus,
        flowTitle: flow?.title || 'Fluxo Recorrente',
        flowType: flow?.type || 'EXPENSE',
        nature: flow?.nature || 'CONFIRMED',
        frequency: flow?.frequency || 'MONTHLY',
        amountType: flow?.amountType || 'FIXED',
        destinationAccountId: flow?.destinationAccountId || null,
        incomeCategory: flow?.incomeCategory || null,
        candidateMatches: evaluation ? evaluation.candidates.slice(0, 5) : [],
        bestMatch: evaluation?.bestMatch || null,
        isAmbiguous: evaluation?.isAmbiguous ?? false,
        canAutoReconcile: evaluation?.canAutoReconcile ?? false,
      };
    });

    return NextResponse.json({
      occurrences: enrichedOccurrences,
      totalCount: enrichedOccurrences.length,
      today: todayStr,
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao listar ocorrências de fluxos recorrentes.', 'occurrences:GET');
  }
}
