import { getDb } from '@/lib/drizzle';
import { attributions } from '@/lib/drizzle/schema';
import type {
  AttributionSourceType,
  AttributionTargetTable,
} from '@/features/ontology/lib/types';

// PRD-E P2-6: 어트리뷰션 write 일원화.
// 신규 노드/관계 생성 시 provenance 를 attributions 테이블에 기록한다.
// push/reconcile 가 읽는 단일 진실원 → 신규 노드의 _src 가 Neo4j 로 운반된다.

// 앱 내부 sourceType(enrich/apply) → attributions 허용 enum 매핑.
const SOURCE_TYPE_MAP: Record<string, AttributionSourceType> = {
  document: 'document',
  sap: 'sap',
  user: 'user',
  web: 'web',
  inferred: 'inferred',
  // enrich/parse 가 쓰는 값 정규화
  session_doc: 'document',
  existing_graph: 'inferred',
};

export function mapAttributionSourceType(
  s?: string | null,
): AttributionSourceType {
  if (!s) return 'inferred';
  return SOURCE_TYPE_MAP[s] ?? 'inferred';
}

export interface AttributionInput {
  targetTable: AttributionTargetTable;
  targetId: string;
  sourceType?: string | null;
  evidence?: string | null;
  confidence?: number | null;
  sourceRef?: string | null;
}

// provenance(sourceType 또는 evidence)가 있을 때만 기록한다(수동 생성은 기록 안 함).
export async function recordAttribution(
  db: Awaited<ReturnType<typeof getDb>>,
  input: AttributionInput,
): Promise<void> {
  if (!input.sourceType && !input.evidence) return;
  await db.insert(attributions).values({
    targetTable: input.targetTable,
    targetId: input.targetId,
    sourceType: mapAttributionSourceType(input.sourceType),
    evidence: input.evidence ?? null,
    confidence: input.confidence ?? null,
    sourceRef: input.sourceRef ?? null,
  });
}
