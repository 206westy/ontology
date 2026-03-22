import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { axioms, axiomClasses } from '@/lib/drizzle/schema';
import { updateAxiomSchema } from '@/features/ontology/lib/schemas';
import { eq } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const body = await request.json();
    const parsed = updateAxiomSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { classIds, ...fields } = parsed.data;

    const db = await getDb();

    if (Object.keys(fields).length > 0) {
      const [row] = await db
        .update(axioms)
        .set(fields)
        .where(eq(axioms.id, id))
        .returning();

      if (!row) {
        return NextResponse.json({ error: 'Axiom not found' }, { status: 404 });
      }
    }

    if (classIds !== undefined) {
      await db.delete(axiomClasses).where(eq(axiomClasses.axiomId, id));
      if (classIds.length > 0) {
        await db.insert(axiomClasses).values(
          classIds.map((classId) => ({ axiomId: id, classId })),
        );
      }
    }

    const result = await db.query.axioms.findFirst({
      where: (a, { eq: eqFn }) => eqFn(a.id, id),
      with: { axiomClasses: true },
    });

    if (!result) {
      return NextResponse.json({ error: 'Axiom not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...result,
      classIds: result.axiomClasses?.map((ac) => ac.classId) ?? [],
      axiomClasses: undefined,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const db = await getDb();
    const [row] = await db
      .delete(axioms)
      .where(eq(axioms.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Axiom not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
