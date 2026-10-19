import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { patrimonialAssets } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await params;

    const existing = await db.select().from(patrimonialAssets).where(eq(patrimonialAssets.id, id)).limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: 'Ativo patrimonial não encontrado' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json({ error: 'Nome do ativo não pode ser vazio' }, { status: 400 });
      }
      updateData.name = body.name.trim();
    }

    if (body.category !== undefined) {
      updateData.category = String(body.category).toUpperCase();
    }

    if (body.currentValue !== undefined) {
      const val = typeof body.currentValue === 'number' ? body.currentValue : parseFloat(String(body.currentValue).replace(',', '.'));
      if (isNaN(val) || val < 0) {
        return NextResponse.json({ error: 'Valor atual do ativo deve ser maior ou igual a zero' }, { status: 400 });
      }
      updateData.currentValue = Math.round(val * 100) / 100;
    }

    if (body.acquisitionValue !== undefined) {
      updateData.acquisitionValue = body.acquisitionValue != null ? Math.round(Number(body.acquisitionValue) * 100) / 100 : null;
    }

    if (body.acquisitionDate !== undefined) {
      updateData.acquisitionDate = body.acquisitionDate || null;
    }

    if (body.valuationDate !== undefined) {
      updateData.valuationDate = body.valuationDate || new Date().toISOString().split('T')[0];
    }

    if (body.liquidity !== undefined) {
      updateData.liquidity = body.liquidity;
    }

    if (body.notes !== undefined) {
      updateData.notes = body.notes ? String(body.notes).trim() : null;
    }

    await db.update(patrimonialAssets).set(updateData).where(eq(patrimonialAssets.id, id));

    const updated = await db.select().from(patrimonialAssets).where(eq(patrimonialAssets.id, id)).limit(1);
    return NextResponse.json({ success: true, asset: updated[0] });
  } catch (error: unknown) {
    return handleApiError(error, 'Falha ao atualizar ativo.', 'patrimony:assets:[id]:PUT');
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await params;

    const existing = await db.select().from(patrimonialAssets).where(eq(patrimonialAssets.id, id)).limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: 'Ativo patrimonial não encontrado' }, { status: 404 });
    }

    await db.delete(patrimonialAssets).where(eq(patrimonialAssets.id, id));
    return NextResponse.json({ success: true, message: 'Ativo removido com sucesso' });
  } catch (error: unknown) {
    return handleApiError(error, 'Falha ao remover ativo.', 'patrimony:assets:[id]:DELETE');
  }
}
