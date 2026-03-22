import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { axioms, axiomClasses } from '@/lib/drizzle/schema';
import { createAxiomSchema } from '@/features/ontology/lib/schemas';
import { handleApiError } from '@/lib/api-error';

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.query.axioms.findMany({
      with: { axiomClasses: true },
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    });

    const result = rows.map((a) => ({
      ...a,
      classIds: a.axiomClasses?.map((ac) => ac.classId) ?? [],
      axiomClasses: undefined,
    }));

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createAxiomSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();
    const [axiom] = await db
      .insert(axioms)
      .values({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        description: parsed.data.description,
        ruleLogic: parsed.data.ruleLogic,
        severity: parsed.data.severity,
      })
      .returning();

    if (parsed.data.classIds.length > 0) {
      await db.insert(axiomClasses).values(
        parsed.data.classIds.map((classId) => ({
          axiomId: axiom.id,
          classId,
        })),
      );
    }

    const created = await db.query.axioms.findFirst({
      where: (a, { eq }) => eq(a.id, axiom.id),
      with: { axiomClasses: true },
    });

    const result = created
      ? {
          ...created,
          classIds: created.axiomClasses?.map((ac) => ac.classId) ?? [],
          axiomClasses: undefined,
        }
      : created;

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
