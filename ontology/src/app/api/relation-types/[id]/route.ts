import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { relationTypes } from '@/lib/drizzle/schema';
import { updateRelationTypeSchema } from '@/features/ontology/lib/schemas';
import { eq, and } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';
import { getOntologyScope } from '@/lib/authz/ontologyContext';

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

    const { ontologyId } = await getOntologyScope(request, 'editor');
    const db = await getDb();
    const [row] = await db
      .update(relationTypes)
      .set(parsed.data)
      .where(and(eq(relationTypes.id, id), eq(relationTypes.ontologyId, ontologyId)))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Relation type not found' }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const { ontologyId } = await getOntologyScope(request, 'editor');
    const db = await getDb();
    const [row] = await db
      .delete(relationTypes)
      .where(and(eq(relationTypes.id, id), eq(relationTypes.ontologyId, ontologyId)))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Relation type not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
