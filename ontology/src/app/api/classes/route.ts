import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { classes } from '@/lib/drizzle/schema';
import { createClassSchema } from '@/features/ontology/lib/schemas';
import { eq, isNull, and } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { resolvePartitionForOntology } from '@/lib/authz/partition-scope';
import { recordAttribution } from '@/lib/attribution';
import { parsePagination } from '@/lib/pagination';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const parentId = searchParams.get('parentId');
  const { limit, offset } = parsePagination(searchParams);

  try {
    const { ontologyId } = await getOntologyScope(request);
    const db = await getDb();
    const parentCondition =
      parentId === null || parentId === undefined
        ? undefined
        : parentId === 'root'
          ? isNull(classes.parentId)
          : eq(classes.parentId, parentId);
    // PRD-PF-A: 활성 온톨로지로 스코프.
    const condition = and(eq(classes.ontologyId, ontologyId), parentCondition);

    // PRD-Perf M0-1: 1536차원 embedding 은 서버 전용(dedup/RAG) 자산 — 클라이언트 응답에서 제외.
    const rows = await db.query.classes.findMany({
      where: condition,
      columns: { embedding: false },
      with: { children: { columns: { embedding: false } }, properties: true },
      orderBy: (c, { asc }) => [asc(c.name)],
      limit,
      offset,
    });

    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createClassSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { ontologyId } = await getOntologyScope(request, 'editor');
    const db = await getDb();
    // 드리프트 트리거 충족: 구획이 이 온톨로지 소속이 아니면 온톨로지 기본 구획으로 대체.
    const partitionId = await resolvePartitionForOntology(
      db,
      ontologyId,
      parsed.data.partitionId,
    );
    const [row] = await db
      .insert(classes)
      .values({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        ontologyId,
        name: parsed.data.name,
        parentId: parsed.data.parentId ?? null,
        partitionId,
        description: parsed.data.description,
        color: parsed.data.color,
        positionX: parsed.data.positionX,
        positionY: parsed.data.positionY,
        sourceType: parsed.data.sourceType ?? null,
        confidence: parsed.data.confidence ?? null,
        evidence: parsed.data.evidence ?? null,
      })
      .returning();

    // PRD-E P2-6: provenance 를 attributions 테이블에 일원화 기록.
    await recordAttribution(db, {
      targetTable: 'classes',
      targetId: row.id,
      sourceType: parsed.data.sourceType,
      evidence: parsed.data.evidence,
      confidence: parsed.data.confidence,
    });

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
