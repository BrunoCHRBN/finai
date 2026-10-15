import { NextResponse, NextRequest } from 'next/server';
import { getPluggyConnectors } from '@/lib/pluggy';

export async function GET(request: NextRequest) {
  try {
    const country = request.nextUrl.searchParams.get('country') || 'BR';

    const connectors = await getPluggyConnectors(country);
    return NextResponse.json({ connectors });
  } catch (error: any) {
    console.error('Error fetching Pluggy connectors:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch connectors' },
      { status: 500 }
    );
  }
}
