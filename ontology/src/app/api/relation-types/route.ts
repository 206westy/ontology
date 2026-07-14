import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { relationTypes } from '@/lib/drizzle/schema';
import { createRelationTypeSchema } from '@/features/ontology/lib/schemas';
import { eq } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { recordRelationTerm } from '@/lib/relation-glossary';

export async function GET(request: Request) {
  try {
    const { ontologyId } = await getOntologyScope(request);
    const db = await getDb();
    const rows = await db.query.relationTypes.findMany({
      where: eq(relationTypes.ontologyId, ontologyId),
      orderBy: (r, { asc }) => [asc(r.name)],
    });

    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createRelationTypeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { ontologyId } = await getOntologyScope(request, 'editor');
    const db = await getDb();
    const [row] = await db
      .insert(relationTypes)
      .values({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        ontologyId,
        name: parsed.data.name,
        description: parsed.data.description,
        // PRD-L M2: 2레이어 분류 저장.
        layer: parsed.data.layer,
        sourceClassId: parsed.data.sourceClassId ?? null,
        targetClassId: parsed.data.targetClassId ?? null,
      })
      .returning();

    // PRD-L M6 (L7): 성장형 관계 어휘집에 사후 기록(비치명 — 실패 무시).
    await recordRelationTerm(db, {
      name: parsed.data.name,
      layer: parsed.data.layer,
      sourceRef: 'api',
    });

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
