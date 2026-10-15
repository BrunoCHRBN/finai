import { NextResponse } from 'next/server';
import { db, ensureDbInitialized } from '@/db';
import { categories } from '@/db/schema';
import { eq } from 'drizzle-orm';


export async function GET() {
  try {
    await ensureDbInitialized();
    const list = await db.select().from(categories);
    return NextResponse.json({ categories: list });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDbInitialized();
    const body = await request.json();
    const { categoryId, budgetLimit } = body;

    if (!categoryId || budgetLimit === undefined) {
      return NextResponse.json({ error: 'categoryId and budgetLimit required' }, { status: 400 });
    }

    await db
      .update(categories)
      .set({ budgetLimit: Number(budgetLimit) })
      .where(eq(categories.id, categoryId));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
