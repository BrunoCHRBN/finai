import { NextResponse, NextRequest } from 'next/server';
import { ensureDbInitialized } from '@/db';
import { getB3Quotes } from '@/lib/market/market-service';
import { handleApiError } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();
    const symbolsParam = request.nextUrl.searchParams.get('symbols') || request.nextUrl.searchParams.get('symbol') || '';
    const range = (request.nextUrl.searchParams.get('range') || '1mo') as
      | '1d'
      | '5d'
      | '1mo'
      | '3mo'
      | '6mo'
      | '1y'
      | undefined;
    const interval = (request.nextUrl.searchParams.get('interval') || '1d') as
      | '1d'
      | '1h'
      | '15m'
      | undefined;
    const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true';

    const symbols = symbolsParam
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    if (symbols.length === 0) {
      return NextResponse.json(
        { error: 'Parâmetro "symbols" é obrigatório (ex: ?symbols=PETR4,VALE3).' },
        { status: 400 }
      );
    }

    const result = await getB3Quotes(symbols, {
      range,
      interval,
      forceRefresh,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao carregar cotações de ações da B3.', 'market:stocks:quote');
  }
}
