import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { patrimonialLiabilities } from '@/db/schema';

export async function POST(request: Request) {
  try {
    await ensureDbInitialized();

    const body = await request.json().catch(() => ({}));
    const {
      name,
      category,
      currentBalance,
      originalAmount,
      interestRate,
      startDate,
      dueDate,
      installmentsTotal,
      installmentsRemaining,
      monthlyPayment,
      creditor,
      notes,
      dataSource,
    } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Nome do passivo / dívida é obrigatório' }, { status: 400 });
    }

    if (!category || typeof category !== 'string') {
      return NextResponse.json({ error: 'Categoria da dívida é obrigatória' }, { status: 400 });
    }

    const parsedBalance = typeof currentBalance === 'number' ? currentBalance : parseFloat(String(currentBalance).replace(',', '.'));
    if (isNaN(parsedBalance) || parsedBalance < 0) {
      return NextResponse.json({ error: 'Saldo devedor deve ser um número positivo ou zero' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const id = `liab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const newLiability = {
      id,
      name: name.trim(),
      category: category.toUpperCase(),
      currentBalance: Math.round(parsedBalance * 100) / 100,
      originalAmount: originalAmount != null ? Math.round(Number(originalAmount) * 100) / 100 : null,
      interestRate: interestRate != null ? Number(interestRate) : null,
      startDate: startDate || null,
      dueDate: dueDate || null,
      installmentsTotal: installmentsTotal != null ? Number(installmentsTotal) : null,
      installmentsRemaining: installmentsRemaining != null ? Number(installmentsRemaining) : null,
      monthlyPayment: monthlyPayment != null ? Math.round(Number(monthlyPayment) * 100) / 100 : null,
      creditor: creditor ? String(creditor).trim() : null,
      notes: notes ? String(notes).trim() : null,
      dataSource: dataSource || 'MANUAL',
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(patrimonialLiabilities).values(newLiability);

    return NextResponse.json({ success: true, liability: newLiability }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating patrimonial liability:', error);
    const msg = error instanceof Error ? error.message : 'Falha ao cadastrar passivo';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
