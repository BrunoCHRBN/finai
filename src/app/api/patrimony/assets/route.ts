import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { patrimonialAssets } from '@/db/schema';
import { handleApiError } from '@/lib/api-error';

export async function POST(request: Request) {
  try {
    await ensureDbInitialized();

    const body = await request.json().catch(() => ({}));
    const {
      name,
      category,
      currentValue,
      acquisitionValue,
      acquisitionDate,
      valuationDate,
      liquidity,
      notes,
      dataSource,
    } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Nome do ativo é obrigatório' }, { status: 400 });
    }

    if (!category || typeof category !== 'string') {
      return NextResponse.json({ error: 'Categoria do ativo é obrigatória' }, { status: 400 });
    }

    const parsedVal = typeof currentValue === 'number' ? currentValue : parseFloat(String(currentValue).replace(',', '.'));
    if (isNaN(parsedVal) || parsedVal < 0) {
      return NextResponse.json({ error: 'Valor atual do ativo deve ser um número positivo ou zero' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const id = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const newAsset = {
      id,
      name: name.trim(),
      category: category.toUpperCase(),
      currentValue: Math.round(parsedVal * 100) / 100,
      acquisitionValue: acquisitionValue != null ? Math.round(Number(acquisitionValue) * 100) / 100 : null,
      acquisitionDate: acquisitionDate || null,
      valuationDate: valuationDate || now.split('T')[0],
      liquidity: liquidity || 'MEDIUM',
      notes: notes ? String(notes).trim() : null,
      dataSource: dataSource || 'MANUAL',
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(patrimonialAssets).values(newAsset);

    return NextResponse.json({ success: true, asset: newAsset }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error, 'Falha ao cadastrar ativo.', 'patrimony:assets:POST');
  }
}
