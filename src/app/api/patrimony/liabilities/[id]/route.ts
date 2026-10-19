import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { patrimonialLiabilities } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await params;

    const existing = await db.select().from(patrimonialLiabilities).where(eq(patrimonialLiabilities.id, id)).limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: 'Passivo / dívida não encontrado' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json({ error: 'Nome da dívida não pode ser vazio' }, { status: 400 });
      }
      updateData.name = body.name.trim();
    }

    if (body.category !== undefined) {
      updateData.category = String(body.category).toUpperCase();
    }

    if (body.currentBalance !== undefined) {
      const balance = typeof body.currentBalance === 'number' ? body.currentBalance : parseFloat(String(body.currentBalance).replace(',', '.'));
      if (isNaN(balance) || balance < 0) {
        return NextResponse.json({ error: 'Saldo devedor deve ser maior ou igual a zero' }, { status: 400 });
      }
      updateData.currentBalance = Math.round(balance * 100) / 100;
    }

    if (body.originalAmount !== undefined) {
      updateData.originalAmount = body.originalAmount != null ? Math.round(Number(body.originalAmount) * 100) / 100 : null;
    }

    if (body.interestRate !== undefined) {
      updateData.interestRate = body.interestRate != null ? Number(body.interestRate) : null;
    }

    if (body.startDate !== undefined) {
      updateData.startDate = body.startDate || null;
    }

    if (body.dueDate !== undefined) {
      updateData.dueDate = body.dueDate || null;
    }

    if (body.installmentsTotal !== undefined) {
      updateData.installmentsTotal = body.installmentsTotal != null ? Number(body.installmentsTotal) : null;
    }

    if (body.installmentsRemaining !== undefined) {
      updateData.installmentsRemaining = body.installmentsRemaining != null ? Number(body.installmentsRemaining) : null;
    }

    if (body.monthlyPayment !== undefined) {
      updateData.monthlyPayment = body.monthlyPayment != null ? Math.round(Number(body.monthlyPayment) * 100) / 100 : null;
    }

    if (body.creditor !== undefined) {
      updateData.creditor = body.creditor ? String(body.creditor).trim() : null;
    }

    if (body.notes !== undefined) {
      updateData.notes = body.notes ? String(body.notes).trim() : null;
    }

    await db.update(patrimonialLiabilities).set(updateData).where(eq(patrimonialLiabilities.id, id));

    const updated = await db.select().from(patrimonialLiabilities).where(eq(patrimonialLiabilities.id, id)).limit(1);
    return NextResponse.json({ success: true, liability: updated[0] });
  } catch (error: unknown) {
    return handleApiError(error, 'Falha ao atualizar passivo.', 'patrimony:liabilities:[id]:PUT');
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await params;

    const existing = await db.select().from(patrimonialLiabilities).where(eq(patrimonialLiabilities.id, id)).limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: 'Passivo / dívida não encontrado' }, { status: 404 });
    }

    await db.delete(patrimonialLiabilities).where(eq(patrimonialLiabilities.id, id));
    return NextResponse.json({ success: true, message: 'Passivo removido com sucesso' });
  } catch (error: unknown) {
    return handleApiError(error, 'Falha ao remover passivo.', 'patrimony:liabilities:[id]:DELETE');
  }
}
