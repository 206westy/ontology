import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { edges } from '@/lib/drizzle/schema';
import { eq } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const db = await getDb();
    const [row] = await db
      .delete(edges)
      .where(eq(edges.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Edge not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
