import { NextResponse, NextRequest } from 'next/server';
import { getPluggyConnectors } from '@/lib/pluggy';
import { handleApiError } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  try {
    const country = request.nextUrl.searchParams.get('country') || 'BR';

    const connectors = await getPluggyConnectors(country);
    return NextResponse.json({ connectors });
  } catch (error: unknown) {
    return handleApiError(error, 'Falha ao buscar conectores Open Finance.', 'pluggy:connectors');
  }
}
