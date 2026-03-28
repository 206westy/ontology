import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { constraints } from '@/lib/drizzle/schema';
import { updateConstraintSchema } from '@/features/ontology/lib/schemas';
import { eq, sql } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const db = await getDb();
    const row = await db.query.constraints.findFirst({
      where: eq(constraints.id, id),
      with: {
        sourceClass: true,
        targetClass: true,
        relationType: true,
        property: true,
      },
    });

    if (!row) {
      return NextResponse.json({ error: 'Constraint not found' }, { status: 404 });
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
    const parsed = updateConstraintSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();
    const [row] = await db
      .update(constraints)
      .set({ ...parsed.data, updatedAt: sql`now()` })
      .where(eq(constraints.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Constraint not found' }, { status: 404 });
    }

    const result = await db.query.constraints.findFirst({
      where: eq(constraints.id, id),
      with: {
        sourceClass: true,
        targetClass: true,
        relationType: true,
        property: true,
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const db = await getDb();
    const [row] = await db
      .delete(constraints)
      .where(eq(constraints.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Constraint not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
