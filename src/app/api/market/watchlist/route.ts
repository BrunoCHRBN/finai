import { NextResponse, NextRequest } from 'next/server';
import { ensureDbInitialized } from '@/db';
import { getWatchlist, addToWatchlist } from '@/lib/market/market-service';
import { handleApiError } from '@/lib/api-error';

export async function GET(_request: NextRequest) {
  try {
    await ensureDbInitialized();
    const items = await getWatchlist();
    return NextResponse.json({ items, count: items.length });
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao carregar lista de ativos acompanhados.', 'market:watchlist:GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDbInitialized();
    const body = await request.json().catch(() => ({}));

    if (!body || !body.assetId) {
      return NextResponse.json(
        { error: 'Campo "assetId" é obrigatório (ex: "B3:PETR4" ou "CRYPTO:BTCUSDT").' },
        { status: 400 }
      );
    }

    await addToWatchlist({
      assetId: String(body.assetId).trim(),
      targetPriceAlertHigh: body.targetPriceAlertHigh ? Number(body.targetPriceAlertHigh) : null,
      targetPriceAlertLow: body.targetPriceAlertLow ? Number(body.targetPriceAlertLow) : null,
      notes: body.notes ? String(body.notes).trim() : null,
    });

    return NextResponse.json({ success: true, message: 'Ativo adicionado à lista de acompanhamento.' }, { status: 201 });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('UNIQUE constraint failed')) {
      return NextResponse.json(
        { error: 'Este ativo já está na sua lista de acompanhamento.' },
        { status: 409 }
      );
    }
    return handleApiError(error, 'Erro ao adicionar ativo aos favoritos.', 'market:watchlist:POST');
  }
}
