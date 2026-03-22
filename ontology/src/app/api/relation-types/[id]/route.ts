import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { relationTypes } from '@/lib/drizzle/schema';
import { updateRelationTypeSchema } from '@/features/ontology/lib/schemas';
import { eq } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const body = await request.json();
    const parsed = updateRelationTypeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();
    const [row] = await db
      .update(relationTypes)
      .set(parsed.data)
      .where(eq(relationTypes.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Relation type not found' }, { status: 404 });
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
      .delete(relationTypes)
      .where(eq(relationTypes.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Relation type not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
