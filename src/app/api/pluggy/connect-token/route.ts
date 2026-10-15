import { NextResponse } from 'next/server';
import { createPluggyConnectToken } from '@/lib/pluggy';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { itemId, connectorId } = body;

    const data = await createPluggyConnectToken({ itemId, connectorId });
    return NextResponse.json({ accessToken: data.accessToken });
  } catch (error: any) {
    console.error('Error generating Pluggy connect token:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate connect token' },
      { status: 500 }
    );
  }
}
