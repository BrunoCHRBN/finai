import { NextResponse, NextRequest } from 'next/server';
import { ensureDbInitialized } from '@/db';
import { searchB3 } from '@/lib/market/market-service';
import { handleApiError } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();
    const query = request.nextUrl.searchParams.get('q') || request.nextUrl.searchParams.get('search') || '';
    const type = request.nextUrl.searchParams.get('type') || undefined;

    const assets = await searchB3(query, type);
    return NextResponse.json({ assets, count: assets.length });
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao pesquisar ativos da B3.', 'market:stocks:search');
  }
}
