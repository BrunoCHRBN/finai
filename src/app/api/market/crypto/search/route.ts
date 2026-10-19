import { NextResponse, NextRequest } from 'next/server';
import { ensureDbInitialized } from '@/db';
import { searchCrypto } from '@/lib/market/market-service';
import { handleApiError } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();
    const query = request.nextUrl.searchParams.get('q') || request.nextUrl.searchParams.get('search') || '';
    const assets = searchCrypto(query);
    return NextResponse.json({ assets, count: assets.length });
  } catch (error: unknown) {
    return handleApiError(error, 'Erro ao pesquisar criptoativos.', 'market:crypto:search');
  }
}
