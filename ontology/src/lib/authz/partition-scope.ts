import 'server-only';

import { eq, asc } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { partitions } from '@/lib/drizzle/schema';

type Db = Awaited<ReturnType<typeof getDb>>;

/**
 * PRD-PF-A M5: 드리프트 트리거(class.ontology_id = partition.ontology_id) 충족용 구획 해소.
 *
 * 요청 구획이 이 온톨로지 소속이면 그대로, 아니면(예: 다른 온톨로지의 기본 구획 sentinel)
 * 이 온톨로지의 기본 구획으로 대체한다. 없으면 생성. 기본 온톨로지 + sentinel 구획은
 * 소속이 일치하므로 추가 쓰기 없이 그대로 반환(스튜디오 경로 무영향).
 */
export async function resolvePartitionForOntology(
  db: Db,
  ontologyId: string,
  requestedId?: string | null,
): Promise<string> {
  if (requestedId) {
    const [p] = await db
      .select({ ontologyId: partitions.ontologyId })
      .from(partitions)
      .where(eq(partitions.id, requestedId))
      .limit(1);
    if (p && p.ontologyId === ontologyId) return requestedId;
  }

  const [existing] = await db
    .select({ id: partitions.id })
    .from(partitions)
    .where(eq(partitions.ontologyId, ontologyId))
    .orderBy(asc(partitions.createdAt))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(partitions)
    .values({ ontologyId, name: '기본 구획' })
    .returning();
  return created.id;
}
