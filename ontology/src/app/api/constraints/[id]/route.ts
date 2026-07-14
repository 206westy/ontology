import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { constraints } from '@/lib/drizzle/schema';
import { updateConstraintSchema } from '@/features/ontology/lib/schemas';
import { eq, and, sql } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';
import { getOntologyScope } from '@/lib/authz/ontologyContext';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const { ontologyId } = await getOntologyScope(request);
    const db = await getDb();
    const row = await db.query.constraints.findFirst({
      where: and(eq(constraints.id, id), eq(constraints.ontologyId, ontologyId)),
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

    const { ontologyId } = await getOntologyScope(request, 'editor');
    const db = await getDb();
    const [row] = await db
      .update(constraints)
      .set({ ...parsed.data, updatedAt: sql`now()` })
      .where(and(eq(constraints.id, id), eq(constraints.ontologyId, ontologyId)))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Constraint not found' }, { status: 404 });
    }

    const result = await db.query.constraints.findFirst({
      where: and(eq(constraints.id, id), eq(constraints.ontologyId, ontologyId)),
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

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const { ontologyId } = await getOntologyScope(request, 'editor');
    const db = await getDb();
    const [row] = await db
      .delete(constraints)
      .where(and(eq(constraints.id, id), eq(constraints.ontologyId, ontologyId)))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Constraint not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
