import { eq, sql } from 'drizzle-orm';
import type { getDb } from '@/lib/drizzle';
import { relationGlossary, relationTypes } from '@/lib/drizzle/schema';
import { embedOne } from '@/features/ontology/lib/embedding';

// PRD-L M6 (L7): 성장형 관계 어휘집 기록 헬퍼(서버 전용).
// 규율: 추출 프롬프트에 재주입 금지 — 사후 정합에서만 참조한다.
// 원본 term 보존(재등장 시 덮어쓰기 금지), 재등장은 occurrence_count 만 증가.
// 애매하면 새 항목이 기본값 — 임베딩 유사 항목은 similar_to 후보 링크만(자동 병합 아님).

type Db = Awaited<ReturnType<typeof getDb>>;

export type RelationLayer = 'semantic' | 'kinetic';

interface RecordRelationTermInput {
  name: string;
  layer?: RelationLayer;
  sourceRef?: string;
}

// 임베딩 코사인 유사도가 이 값 이상이면 similar_to 후보로 링크(병합은 하지 않음).
const SIMILAR_THRESHOLD = 0.85;

// 관계 이름 한 개를 어휘집에 기록한다. 신규면 insert, 재등장이면 occurrence_count 만 +1.
// 모든 실패는 비치명(내부 try/catch) — 어휘집 기록 실패가 관계 생성을 막지 않는다.
export async function recordRelationTerm(
  db: Db,
  { name, layer = 'semantic', sourceRef }: RecordRelationTermInput,
): Promise<void> {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return;

  try {
    // upsert: 충돌(같은 normalized_term)이면 occurrence_count 만 증가.
    // term/layer/meaning 은 SET 에 넣지 않는다 — 원본 표현 보존이 규율.
    const [row] = await db
      .insert(relationGlossary)
      .values({
        term: name.trim(),
        normalizedTerm: normalized,
        layer,
        sourceRef: sourceRef ?? null,
      })
      .onConflictDoUpdate({
        target: relationGlossary.normalizedTerm,
        set: {
          occurrenceCount: sql`${relationGlossary.occurrenceCount} + 1`,
          updatedAt: sql`now()`,
        },
      })
      .returning({
        id: relationGlossary.id,
        occurrenceCount: relationGlossary.occurrenceCount,
      });

    // occurrence_count === 1 ⟺ 방금 새로 삽입됨(충돌 갱신은 2 이상). 신규일 때만 임베딩 시도.
    if (!row || row.occurrenceCount !== 1) return;
    await backfillEmbeddingAndSimilar(db, row.id, name.trim());
  } catch {
    // 비치명: 로깅만(호출부의 관계 생성은 이미 성공했다).
  }
}

// PRD-L M6 (L7) 보강: 관계 "사용"(엣지 생성) 기반 기록.
// 유형이 재사용될 때도 어휘집이 계속 자라야 하므로(occurrence_count 재등장 의미),
// 엣지 생성 초크포인트에서 relationTypeId 를 이름/레이어로 해소해 기록한다.
// 모든 실패는 비치명 — 엣지 생성을 막지 않는다.
export async function recordRelationUsage(
  db: Db,
  { relationTypeId, sourceRef }: { relationTypeId: string; sourceRef?: string },
): Promise<void> {
  try {
    const rt = await db.query.relationTypes.findFirst({
      where: eq(relationTypes.id, relationTypeId),
      columns: { name: true, layer: true },
    });
    if (!rt) return;
    await recordRelationTerm(db, {
      name: rt.name,
      layer: rt.layer === 'kinetic' ? 'kinetic' : 'semantic',
      sourceRef,
    });
  } catch {
    // 비치명.
  }
}

// 신규 항목에 임베딩을 채우고, 최근접 기존 항목이 임계 이상이면 similar_to 후보를 링크.
// 임베딩 생성 실패(키 없음·API 오류)면 embedding NULL 로 우아하게 강등하고 반환.
async function backfillEmbeddingAndSimilar(
  db: Db,
  id: string,
  text: string,
): Promise<void> {
  let vector: number[];
  try {
    vector = await embedOne(text);
  } catch {
    return;
  }
  if (!vector || vector.length === 0) return;

  const vecLiteral = `[${vector.join(',')}]`;

  // 자기 자신 제외, 임베딩 있는 항목 중 코사인 최근접 1개.
  const rows = (await db.execute(sql`
    SELECT id::text AS id, 1 - (embedding <=> ${vecLiteral}::vector) AS score
    FROM relation_glossary
    WHERE embedding IS NOT NULL AND id <> ${id}
    ORDER BY embedding <=> ${vecLiteral}::vector
    LIMIT 1
  `)) as unknown as Array<{ id: string; score: number }>;

  const nearest = rows[0];
  const similarTo =
    nearest && Number(nearest.score) >= SIMILAR_THRESHOLD ? nearest.id : null;

  await db
    .update(relationGlossary)
    .set({ embedding: vector, ...(similarTo ? { similarTo } : {}) })
    .where(eq(relationGlossary.id, id));
}
