import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { accounts, patrimonialAssets, patrimonialLiabilities, patrimonialSnapshots } from '@/db/schema';
import { calculatePatrimonialSummary } from '@/lib/patrimony-engine';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  try {
    await ensureDbInitialized();

    const body = await request.json().catch(() => ({}));
    const targetMonth = body.month || new Date().toISOString().slice(0, 7);

    const allAccounts = await db.select().from(accounts);
    const allAssets = await db.select().from(patrimonialAssets);
    const allLiabilities = await db.select().from(patrimonialLiabilities);

    const summary = calculatePatrimonialSummary(allAccounts, allAssets, allLiabilities);

    const snapshotId = `snap_${targetMonth}`;
    const now = new Date().toISOString();

    const snapshotData = {
      id: snapshotId,
      month: targetMonth,
      totalAssets: summary.totalAssets,
      totalLiabilities: summary.totalLiabilities,
      netWorth: summary.netWorth,
      liquidAssets: summary.liquidAssets,
      investedAssets: summary.investedAssets,
      fixedAssets: summary.fixedAssets,
      shortTermLiabilities: summary.shortTermLiabilities,
      longTermLiabilities: summary.longTermLiabilities,
      detailsJson: JSON.stringify({
        solvencyStatus: summary.solvencyStatus,
        debtToAssetRatioPct: summary.debtToAssetRatioPct,
        allocation: summary.allocation,
        composition: summary.composition,
      }),
      createdAt: now,
    };

    const existing = await db.select().from(patrimonialSnapshots).where(eq(patrimonialSnapshots.month, targetMonth)).limit(1);
    if (existing.length > 0) {
      await db.update(patrimonialSnapshots).set(snapshotData).where(eq(patrimonialSnapshots.month, targetMonth));
    } else {
      await db.insert(patrimonialSnapshots).values(snapshotData);
    }

    return NextResponse.json({ success: true, snapshot: snapshotData });
  } catch (error: unknown) {
    console.error('Error generating patrimonial snapshot:', error);
    const msg = error instanceof Error ? error.message : 'Falha ao registrar snapshot patrimonial';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
