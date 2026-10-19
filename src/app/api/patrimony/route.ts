import { NextResponse, NextRequest } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { accounts, patrimonialAssets, patrimonialLiabilities, patrimonialSnapshots } from '@/db/schema';
import { calculatePatrimonialSummary } from '@/lib/patrimony-engine';
import { desc, asc } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  try {
    await ensureDbInitialized();

    const allAccounts = await db.select().from(accounts);
    const allAssets = await db.select().from(patrimonialAssets).orderBy(desc(patrimonialAssets.currentValue));
    const allLiabilities = await db.select().from(patrimonialLiabilities).orderBy(desc(patrimonialLiabilities.currentBalance));
    const snapshots = await db.select().from(patrimonialSnapshots).orderBy(asc(patrimonialSnapshots.month));

    const summary = calculatePatrimonialSummary(allAccounts, allAssets, allLiabilities);

    return NextResponse.json({
      summary,
      snapshots,
      totalAssetsCount: allAssets.length,
      totalLiabilitiesCount: allLiabilities.length,
      totalAccountsCount: allAccounts.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Falha ao consolidar dados patrimoniais.', 'patrimony:GET');
  }
}
