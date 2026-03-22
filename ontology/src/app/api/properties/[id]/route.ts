import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { properties } from '@/lib/drizzle/schema';
import { updatePropertySchema } from '@/features/ontology/lib/schemas';
import { eq } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const body = await request.json();
    const parsed = updatePropertySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();
    const [row] = await db
      .update(properties)
      .set(parsed.data)
      .where(eq(properties.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
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
      .delete(properties)
      .where(eq(properties.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
