import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { recurringOccurrences, recurringFlows, transactions } from '@/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';
import { roundCurrency, safeNumeric } from '@/lib/planning-engine';
import { deriveOccurrenceStatus } from '@/lib/recurring-engine';

export async function POST(request: Request) {
  try {
    await ensureDbInitialized();
    const body = await request.json();

    const occurrenceId = typeof body.occurrenceId === 'string' ? body.occurrenceId.trim() : '';
    if (!occurrenceId) {
      return NextResponse.json(
        { error: 'O ID da ocorrência (occurrenceId) é obrigatório.' },
        { status: 400 }
      );
    }

    const action = typeof body.action === 'string' ? body.action.trim().toUpperCase() : 'RECONCILE';
    if (!['RECONCILE', 'UNRECONCILE', 'MANUALLY_CONFIRM'].includes(action)) {
      return NextResponse.json(
        { error: 'Ação inválida. Utilize RECONCILE, UNRECONCILE ou MANUALLY_CONFIRM.' },
        { status: 400 }
      );
    }

    const existingOcc = await db
      .select()
      .from(recurringOccurrences)
      .where(eq(recurringOccurrences.id, occurrenceId));

    if (existingOcc.length === 0) {
      return NextResponse.json(
        { error: 'Ocorrência de fluxo recorrente não encontrada.' },
        { status: 404 }
      );
    }

    const occ = existingOcc[0];
    const now = new Date().toISOString();
    const todayStr = now.split('T')[0];

    // Get parent flow to check flow type
    const parentFlows = await db
      .select()
      .from(recurringFlows)
      .where(eq(recurringFlows.id, occ.flowId));
    const flow = parentFlows[0];

    if (action === 'UNRECONCILE') {
      const derivedStatus = deriveOccurrenceStatus(
        { expectedDate: occ.expectedDate, status: 'PENDING' },
        todayStr
      );
      await db
        .update(recurringOccurrences)
        .set({
          status: derivedStatus,
          transactionId: null,
          reconciledAmount: null,
          reconciledAt: null,
          confidenceScore: null,
          updatedAt: now,
        })
        .where(eq(recurringOccurrences.id, occurrenceId));

      return NextResponse.json({
        success: true,
        action: 'UNRECONCILE',
        occurrenceId,
        status: derivedStatus,
        updatedAt: now,
      });
    }

    if (action === 'MANUALLY_CONFIRM') {
      const confirmedAmount =
        body.reconciledAmount !== undefined
          ? roundCurrency(safeNumeric(body.reconciledAmount, Number(occ.expectedAmount)))
          : roundCurrency(Number(occ.expectedAmount));

      await db
        .update(recurringOccurrences)
        .set({
          status: 'MANUALLY_CONFIRMED',
          transactionId: null,
          reconciledAmount: confirmedAmount,
          reconciledAt: now,
          confidenceScore: 100,
          notes: typeof body.notes === 'string' ? body.notes.trim() : occ.notes,
          updatedAt: now,
        })
        .where(eq(recurringOccurrences.id, occurrenceId));

      return NextResponse.json({
        success: true,
        action: 'MANUALLY_CONFIRM',
        occurrenceId,
        status: 'MANUALLY_CONFIRMED',
        reconciledAmount: confirmedAmount,
        updatedAt: now,
      });
    }

    // Action === 'RECONCILE'
    const transactionId = typeof body.transactionId === 'string' ? body.transactionId.trim() : '';
    if (!transactionId) {
      return NextResponse.json(
        { error: 'O ID da transação (transactionId) é obrigatório para conciliação.' },
        { status: 400 }
      );
    }

    const matchedTxList = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId));

    if (matchedTxList.length === 0) {
      return NextResponse.json(
        { error: 'Transação informada para conciliação não encontrada.' },
        { status: 404 }
      );
    }

    const tx = matchedTxList[0];

    // Invariant: Transações ignoradas ou transferências nunca podem conciliar fluxos operacionais
    if (tx.isIgnored) {
      return NextResponse.json(
        { error: 'Transações ignoradas (is_ignored = 1) não podem ser conciliadas.' },
        { status: 400 }
      );
    }
    if ((tx.type || '').toUpperCase() === 'TRANSFER') {
      return NextResponse.json(
        { error: 'Transferências entre contas próprias não podem conciliar receitas ou despesas operacionais.' },
        { status: 400 }
      );
    }

    // Invariant: Uma transação só pode ser vinculada a uma ocorrência (não duplicar conciliações)
    const alreadyLinked = await db
      .select()
      .from(recurringOccurrences)
      .where(
        and(
          eq(recurringOccurrences.transactionId, tx.id),
          ne(recurringOccurrences.id, occurrenceId),
          eq(recurringOccurrences.status, 'RECONCILED')
        )
      );

    if (alreadyLinked.length > 0) {
      return NextResponse.json(
        { error: 'Esta transação já está vinculada a outra ocorrência conciliada.' },
        { status: 409 }
      );
    }

    // Type compatibility
    const flowType = (flow?.type || 'EXPENSE').toUpperCase();
    const txType = (tx.type || 'DEBIT').toUpperCase();

    if (flowType === 'INCOME' && txType !== 'CREDIT') {
      return NextResponse.json(
        { error: 'Uma ocorrência de receita só pode ser conciliada com uma transação de crédito (entrada).' },
        { status: 400 }
      );
    }
    if (flowType === 'EXPENSE' && txType !== 'DEBIT') {
      return NextResponse.json(
        { error: 'Uma ocorrência de despesa só pode ser conciliada com uma transação de débito (saída).' },
        { status: 400 }
      );
    }

    const finalAmount =
      body.reconciledAmount !== undefined
        ? roundCurrency(safeNumeric(body.reconciledAmount, Math.abs(Number(tx.amount))))
        : roundCurrency(Math.abs(Number(tx.amount)));

    const confidenceScore =
      body.confidenceScore !== undefined ? Math.round(Number(body.confidenceScore)) : 100;

    await db
      .update(recurringOccurrences)
      .set({
        status: 'RECONCILED',
        transactionId: tx.id,
        reconciledAmount: finalAmount,
        reconciledAt: now,
        confidenceScore,
        notes: typeof body.notes === 'string' ? body.notes.trim() : occ.notes,
        updatedAt: now,
      })
      .where(eq(recurringOccurrences.id, occurrenceId));

    return NextResponse.json({
      success: true,
      action: 'RECONCILE',
      occurrenceId,
      transactionId: tx.id,
      reconciledAmount: finalAmount,
      status: 'RECONCILED',
      updatedAt: now,
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao processar conciliação de ocorrência.', 'occurrences:reconcile:POST');
  }
}
