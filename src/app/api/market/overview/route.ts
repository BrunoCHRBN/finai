import { NextResponse, NextRequest } from 'next/server';
import { ensureDbInitialized } from '@/db';
import { getMarketOverview } from '@/lib/market/market-service';
import { handleApiError } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();
    const forceRefresh = request.nextUrl.searchParams.get('refresh') === 'true';
    const overview = await getMarketOverview({ forceRefresh });
    return NextResponse.json(overview);
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao carregar o panorama de mercado.', 'market:overview');
  }
}
