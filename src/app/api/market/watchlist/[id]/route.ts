import { NextResponse, NextRequest } from 'next/server';
import { ensureDbInitialized } from '@/db';
import { removeFromWatchlist } from '@/lib/market/market-service';
import { handleApiError } from '@/lib/api-error';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Identificador do ativo é obrigatório.' }, { status: 400 });
    }

    const removed = await removeFromWatchlist(id);
    if (!removed) {
      return NextResponse.json({ error: 'Item não encontrado na lista de acompanhamento.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Item removido da lista de acompanhamento.' });
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao remover ativo dos favoritos.', 'market:watchlist:DELETE');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Identificador do item é obrigatório.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { updateWatchlist } = await import('@/lib/market/market-service');

    const updated = await updateWatchlist(id, {
      targetPriceAlertHigh: body.targetPriceAlertHigh !== undefined ? (body.targetPriceAlertHigh ? Number(body.targetPriceAlertHigh) : null) : undefined,
      targetPriceAlertLow: body.targetPriceAlertLow !== undefined ? (body.targetPriceAlertLow ? Number(body.targetPriceAlertLow) : null) : undefined,
      notes: body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Item não encontrado na lista de acompanhamento.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Alertas atualizados com sucesso.' });
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao atualizar alertas do ativo.', 'market:watchlist:PATCH');
  }
}

