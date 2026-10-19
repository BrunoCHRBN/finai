import { NextResponse, NextRequest } from 'next/server';
import { ensureDbInitialized } from '@/db';
import { getCryptoQuotes } from '@/lib/market/market-service';
import { fetchBinanceKlines } from '@/lib/market/binance-adapter';
import { handleApiError } from '@/lib/api-error';
import type { HistoricalCandle } from '@/lib/market/types';

export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();
    const symbolsParam = request.nextUrl.searchParams.get('symbols') || request.nextUrl.searchParams.get('symbol') || '';
    const includeCandles = request.nextUrl.searchParams.get('candles') === 'true';
    const interval = request.nextUrl.searchParams.get('interval') || '1d';
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '30', 10);
    const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true';

    const symbols = symbolsParam
      ? symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
      : undefined;

    const result = await getCryptoQuotes(symbols, { forceRefresh });

    const candlesBySymbol: Record<string, HistoricalCandle[]> = {};
    if (includeCandles && result.quotes.length > 0) {
      const topSymbols = result.quotes.slice(0, 3).map((q) => q.symbol);
      const candlePromises = topSymbols.map(async (sym) => {
        try {
          const candles = await fetchBinanceKlines(sym, interval, limit);
          return { sym, candles };
        } catch {
          return { sym, candles: [] };
        }
      });
      const candleResults = await Promise.all(candlePromises);
      for (const cr of candleResults) {
        candlesBySymbol[cr.sym] = cr.candles;
      }
    }

    return NextResponse.json({
      ...result,
      candlesBySymbol,
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao carregar cotações de criptomoedas.', 'market:crypto:quote');
  }
}
