import { NextResponse } from 'next/server';
import { createPluggyConnectToken } from '@/lib/pluggy';
import { handleApiError } from '@/lib/api-error';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { itemId, connectorId } = body;

    const data = await createPluggyConnectToken({ itemId, connectorId });
    return NextResponse.json({ accessToken: data.accessToken });
  } catch (error: unknown) {
    return handleApiError(error, 'Falha ao gerar token de conexão Open Finance.', 'pluggy:connect-token');
  }
}
