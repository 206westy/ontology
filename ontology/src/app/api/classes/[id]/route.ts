import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { classes } from '@/lib/drizzle/schema';
import { updateClassSchema } from '@/features/ontology/lib/schemas';
import { eq, sql } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const db = await getDb();
    const row = await db.query.classes.findFirst({
      where: eq(classes.id, id),
      with: {
        children: true,
        properties: { orderBy: (p, { asc }) => [asc(p.sortOrder)] },
        instances: true,
        parent: true,
      },
    });

    if (!row) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const body = await request.json();
    const parsed = updateClassSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();
    const [row] = await db
      .update(classes)
      .set({ ...parsed.data, updatedAt: sql`now()` })
      .where(eq(classes.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const db = await getDb();
    const [row] = await db
      .delete(classes)
      .where(eq(classes.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
