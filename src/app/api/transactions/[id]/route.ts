import { NextResponse } from 'next/server';
import { db, client, ensureDbInitialized } from '@/db';
import { transactions, accounts } from '@/db/schema';
import { normalizeTransactionValues } from '@/lib/transactions';
import { eq } from 'drizzle-orm';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    const body = await request.json();

    const existing = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: 'Transação não encontrada' }, { status: 404 });
    }
    const currentTx = existing[0];

    // Case 1: Toggling isIgnored flag
    // Does NOT alter accounts.balance (strictly changes analytical participation)
    if (body.isIgnored !== undefined) {
      const isIgnoredVal = body.isIgnored === 1 || body.isIgnored === true ? 1 : 0;
      await db
        .update(transactions)
        .set({ isIgnored: isIgnoredVal })
        .where(eq(transactions.id, id));

      return NextResponse.json({
        success: true,
        id,
        isIgnored: isIgnoredVal,
      });
    }

    // Case 2: Changing Category or Description only
    if (body.categoryId !== undefined || body.description !== undefined) {
      const updateData: any = {};
      if (body.categoryId !== undefined) updateData.categoryId = body.categoryId || null;
      if (body.description !== undefined) updateData.description = body.description.trim();

      await db.update(transactions).set(updateData).where(eq(transactions.id, id));
      return NextResponse.json({ success: true, id, ...updateData });
    }

    // Case 3: Editing Amount / Type / Account on Manual Transaction
    // Must update accounts.balance atomically with full rollback on failure
    if (body.amount !== undefined || body.type !== undefined || body.accountId !== undefined) {
      if (currentTx.pluggyTransactionId) {
        return NextResponse.json({
          error: 'Transações bancárias sincronizadas via Open Finance não permitem alteração de valor ou conta.',
        }, { status: 400 });
      }

      const newAccountId = body.accountId || currentTx.accountId;
      const targetAccRes = await db.select().from(accounts).where(eq(accounts.id, newAccountId)).limit(1);
      if (targetAccRes.length === 0) {
        return NextResponse.json({ error: 'Conta associada não encontrada' }, { status: 404 });
      }
      const targetAcc = targetAccRes[0];

      const { amount: newAmount, type: newType } = normalizeTransactionValues({
        amount: body.amount !== undefined ? body.amount : currentTx.amount,
        type: body.type !== undefined ? body.type : currentTx.type,
      });

      const oldAmount = currentTx.amount;
      const oldAccountId = currentTx.accountId;
      const now = new Date().toISOString();

      if (oldAccountId === newAccountId) {
        // Same account: delta = newAmount - oldAmount
        const delta = Math.round((newAmount - oldAmount) * 100) / 100;
        const newBalance = Math.round((targetAcc.balance + delta) * 100) / 100;

        await client.batch([
          {
            sql: `UPDATE transactions SET amount = ?, type = ?, description = COALESCE(?, description), date = COALESCE(?, date) WHERE id = ?;`,
            args: [newAmount, newType, body.description ? body.description.trim() : null, body.date || null, id],
          },
          {
            sql: `UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?;`,
            args: [newBalance, now, newAccountId],
          },
        ], 'write');

        return NextResponse.json({
          success: true,
          id,
          amount: newAmount,
          type: newType,
          account: { id: newAccountId, newBalance },
        });
      } else {
        // Different account: revert from old account, apply to new account
        const oldAccRes = await db.select().from(accounts).where(eq(accounts.id, oldAccountId)).limit(1);
        const oldAcc = oldAccRes[0];
        const newOldBalance = oldAcc ? Math.round((oldAcc.balance - oldAmount) * 100) / 100 : 0;
        const newDestBalance = Math.round((targetAcc.balance + newAmount) * 100) / 100;

        await client.batch([
          {
            sql: `UPDATE transactions SET account_id = ?, amount = ?, type = ?, description = COALESCE(?, description), date = COALESCE(?, date) WHERE id = ?;`,
            args: [newAccountId, newAmount, newType, body.description ? body.description.trim() : null, body.date || null, id],
          },
          ...(oldAcc ? [{
            sql: `UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?;`,
            args: [newOldBalance, now, oldAccountId],
          }] : []),
          {
            sql: `UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?;`,
            args: [newDestBalance, now, newAccountId],
          },
        ], 'write');

        return NextResponse.json({
          success: true,
          id,
          amount: newAmount,
          type: newType,
          oldAccount: { id: oldAccountId, newBalance: newOldBalance },
          newAccount: { id: newAccountId, newBalance: newDestBalance },
        });
      }
    }

    return NextResponse.json({ error: 'Nenhum campo reconhecido para atualização' }, { status: 400 });
  } catch (error: unknown) {
    console.error('Error updating transaction:', error);
    return NextResponse.json({ error: 'Erro ao atualizar movimentação financeira' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await params;

    const existing = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: 'Transação não encontrada' }, { status: 404 });
    }
    const currentTx = existing[0];

    // If it's a manual transaction, atomically revert its effect on accounts.balance
    if (!currentTx.pluggyTransactionId) {
      const accRes = await db.select().from(accounts).where(eq(accounts.id, currentTx.accountId)).limit(1);
      const acc = accRes[0];
      const now = new Date().toISOString();

      if (acc) {
        // Revert effect: balance = balance - amount (since amount was positive for income, negative for expense)
        const revertedBalance = Math.round((acc.balance - currentTx.amount) * 100) / 100;

        await client.batch([
          {
            sql: `DELETE FROM transactions WHERE id = ?;`,
            args: [id],
          },
          {
            sql: `UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?;`,
            args: [revertedBalance, now, currentTx.accountId],
          },
        ], 'write');

        return NextResponse.json({
          success: true,
          deletedId: id,
          account: { id: currentTx.accountId, revertedBalance },
        });
      }
    }

    // If it's a synced bank transaction, deleting it does not modify the bank's reference balance
    await db.delete(transactions).where(eq(transactions.id, id));

    return NextResponse.json({
      success: true,
      deletedId: id,
    });
  } catch (error: unknown) {
    console.error('Error deleting transaction:', error);
    return NextResponse.json({ error: 'Erro ao excluir movimentação financeira' }, { status: 500 });
  }
}
