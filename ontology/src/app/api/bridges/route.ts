import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { edges } from '@/lib/drizzle/schema';
import { handleApiError } from '@/lib/api-error';
import { recordAttribution } from '@/lib/attribution';
import { recordRelationUsage } from '@/lib/relation-glossary';
import {
  buildBridgeSuggestions,
  createBridgeSchema,
  type CrossPartitionCandidate,
} from '@/features/ontology/lib/bridge/cross-partition';

// PRD-H (H6/M4): 크로스-구획 브릿지 후보(GET) + 브릿지 엣지 생성(POST).
// 동일성 판정은 dedup 인프라(pgvector 코사인 + pg_trgm)를 크로스-구획으로 스코프해 재사용한다.
// 자동 생성 금지 — 후보만 반환하고 생성은 컨펌(POST)에서만. 브릿지는 타입·근거를 기록한다.

const DEFAULT_LIMIT = 50;

type SimRow = {
  source_id: string;
  source_name: string;
  source_partition: string;
  target_id: string;
  target_name: string;
  target_partition: string;
  vscore: number;
  tscore: number | null;
};

function toCandidate(kind: 'class' | 'instance') {
  return (r: SimRow): CrossPartitionCandidate => ({
    sourceId: r.source_id,
    targetId: r.target_id,
    sourceName: r.source_name,
    targetName: r.target_name,
    sourcePartition: r.source_partition,
    targetPartition: r.target_partition,
    kind,
    vectorScore: r.vscore != null ? Number(r.vscore) : null,
    trigramScore: r.tscore != null ? Number(r.tscore) : null,
    relationType: null,
    evidence: null,
  });
}

async function classCandidates(
  db: Awaited<ReturnType<typeof getDb>>,
  k: number,
): Promise<CrossPartitionCandidate[]> {
  const rows = (await db.execute(sql`
    SELECT a.id::text AS source_id, a.name AS source_name, a.partition_id::text AS source_partition,
           b.id::text AS target_id, b.name AS target_name, b.partition_id::text AS target_partition,
           1 - (a.embedding <=> b.embedding) AS vscore, similarity(a.name, b.name) AS tscore
    FROM classes a
    JOIN classes b ON a.id < b.id AND a.partition_id <> b.partition_id
    WHERE a.embedding IS NOT NULL AND b.embedding IS NOT NULL
    ORDER BY a.embedding <=> b.embedding
    LIMIT ${k}
  `)) as unknown as SimRow[];
  return rows.map(toCandidate('class'));
}

async function instanceCandidates(
  db: Awaited<ReturnType<typeof getDb>>,
  k: number,
): Promise<CrossPartitionCandidate[]> {
  const rows = (await db.execute(sql`
    SELECT ia.id::text AS source_id, ia.name AS source_name, ca.partition_id::text AS source_partition,
           ib.id::text AS target_id, ib.name AS target_name, cb.partition_id::text AS target_partition,
           1 - (ia.embedding <=> ib.embedding) AS vscore, similarity(ia.name, ib.name) AS tscore
    FROM instances ia
    JOIN classes ca ON ia.class_id = ca.id
    JOIN instances ib ON ia.id < ib.id
    JOIN classes cb ON ib.class_id = cb.id AND ca.partition_id <> cb.partition_id
    WHERE ia.embedding IS NOT NULL AND ib.embedding IS NOT NULL
    ORDER BY ia.embedding <=> ib.embedding
    LIMIT ${k}
  `)) as unknown as SimRow[];
  return rows.map(toCandidate('instance'));
}

export async function GET(request: NextRequest) {
  try {
    const kParam = Number(request.nextUrl.searchParams.get('k'));
    const k = Number.isFinite(kParam) && kParam > 0 ? Math.floor(kParam) : DEFAULT_LIMIT;

    const db = await getDb();
    const [classes, instances] = await Promise.all([
      classCandidates(db, k),
      instanceCandidates(db, k),
    ]);

    const suggestions = buildBridgeSuggestions([...classes, ...instances]);
    return NextResponse.json({ suggestions });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = createBridgeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    const db = await getDb();
    const [row] = await db
      .insert(edges)
      .values({
        relationTypeId: data.relationTypeId,
        sourceId: data.sourceId,
        targetId: data.targetId,
        sourceKind: data.sourceKind,
        targetKind: data.targetKind,
        // H6: 구획을 넘는 연결 — is_bridge 로 표시.
        isBridge: true,
        sourceType: 'inferred',
        evidence: data.evidence ?? null,
        confidence: data.confidence ?? null,
      })
      .returning();

    await recordAttribution(db, {
      targetTable: 'edges',
      targetId: row.id,
      sourceType: 'inferred',
      evidence: data.evidence ?? null,
      confidence: data.confidence ?? null,
    });

    // PRD-L M6 (L7) 보강: 브릿지도 관계 이름 사용 — 어휘집 재등장 기록(비치명).
    await recordRelationUsage(db, {
      relationTypeId: row.relationTypeId,
      sourceRef: 'bridge',
    });

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
