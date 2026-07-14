import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { constraints } from '@/lib/drizzle/schema';
import { createConstraintSchema } from '@/features/ontology/lib/schemas';
import { eq } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { recordAttribution } from '@/lib/attribution';

export async function GET(request: NextRequest) {
  const constraintType = request.nextUrl.searchParams.get('constraintType');
  const sourceClassId = request.nextUrl.searchParams.get('sourceClassId');

  try {
    const { ontologyId } = await getOntologyScope(request);
    const db = await getDb();

    const rows = await db.query.constraints.findMany({
      where: (c, { eq: eqFn, and }) => {
        const conditions = [eqFn(c.ontologyId, ontologyId)];
        if (constraintType) conditions.push(eqFn(c.constraintType, constraintType));
        if (sourceClassId) conditions.push(eqFn(c.sourceClassId, sourceClassId));
        return and(...conditions);
      },
      with: {
        sourceClass: true,
        targetClass: true,
        relationType: true,
        property: true,
      },
      orderBy: (c, { desc }) => [desc(c.createdAt)],
    });

    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createConstraintSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { ontologyId } = await getOntologyScope(request, 'editor');
    const db = await getDb();
    const [row] = await db
      .insert(constraints)
      .values({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        ontologyId,
        // PRD-L M1: enforced=타입 규칙 / memo=설명 메모(constraintType NULL).
        kind: parsed.data.kind,
        constraintType: parsed.data.constraintType ?? null,
        description: parsed.data.description,
        sourceClassId: parsed.data.sourceClassId ?? null,
        targetClassId: parsed.data.targetClassId ?? null,
        relationTypeId: parsed.data.relationTypeId ?? null,
        propertyId: parsed.data.propertyId ?? null,
        config: parsed.data.config,
        severity: parsed.data.severity,
        isActive: parsed.data.isActive,
      })
      .returning();

    // PRD-E P2-7: 거버넌스 제안 출처를 attributions 에 기록.
    await recordAttribution(db, {
      targetTable: 'constraints',
      targetId: row.id,
      sourceType: parsed.data.sourceType,
      evidence: parsed.data.evidence,
      confidence: parsed.data.confidence,
    });

    const result = await db.query.constraints.findFirst({
      where: eq(constraints.id, row.id),
      with: {
        sourceClass: true,
        targetClass: true,
        relationType: true,
        property: true,
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
