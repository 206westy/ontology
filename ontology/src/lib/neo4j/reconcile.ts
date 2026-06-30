import type { Session } from 'neo4j-driver';
import type { getDb } from '@/lib/drizzle';

// PRD-E P1-4: Supabase(스테이징) ↔ Neo4j(발행본) 무손실 대조.
// 노드/관계 수 + 핵심 속성 체크섬(instance_values·attribution 포함)을 비교한다.

// Neo4j Instance 노드의 예약 키 (나머지는 instance_values 평탄화 값).
const RESERVED_INSTANCE_KEYS = new Set([
  'id',
  'name',
  'classId',
  'partition',
  'description',
  'embedding',
  '_src',
  '_conf',
  '_srcRef',
]);

export interface ModelSnapshot {
  counts: {
    classes: number;
    instances: number;
    relationTypes: number;
    edges: number;
  };
  // instanceId → 정렬된 "prop=value;…" 시그니처
  instanceValues: Record<string, string>;
  // "table:id" → source_type (출처 존재/일치 확인)
  attributions: Record<string, string>;
}

export interface ReconcileDiff {
  kind:
    | 'count_mismatch'
    | 'instance_values_mismatch'
    | 'attribution_missing'
    | 'attribution_mismatch';
  detail: string;
}

function normValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  // Neo4j Integer 객체 등도 String() 으로 일관 변환
  return String(typeof v === 'object' && 'toString' in v ? v.toString() : v);
}

export function valueSignature(pairs: Array<[string, unknown]>): string {
  return pairs
    .filter(([k]) => !RESERVED_INSTANCE_KEYS.has(k))
    .map(([k, v]) => `${k}=${normValue(v)}`)
    .sort()
    .join(';');
}

// 순수 함수: 두 스냅샷의 차이를 계산한다 (CI 테스트 대상).
export function diffSnapshots(
  supabase: ModelSnapshot,
  neo4j: ModelSnapshot,
): ReconcileDiff[] {
  const diffs: ReconcileDiff[] = [];

  for (const key of ['classes', 'instances', 'relationTypes', 'edges'] as const) {
    if (supabase.counts[key] !== neo4j.counts[key]) {
      diffs.push({
        kind: 'count_mismatch',
        detail: `${key}: supabase=${supabase.counts[key]} neo4j=${neo4j.counts[key]}`,
      });
    }
  }

  for (const [id, sig] of Object.entries(supabase.instanceValues)) {
    if (neo4j.instanceValues[id] !== sig) {
      diffs.push({
        kind: 'instance_values_mismatch',
        detail: `instance ${id}: supabase="${sig}" neo4j="${neo4j.instanceValues[id] ?? ''}"`,
      });
    }
  }

  for (const [key, src] of Object.entries(supabase.attributions)) {
    if (!(key in neo4j.attributions)) {
      diffs.push({ kind: 'attribution_missing', detail: `${key} (source=${src})` });
    } else if (neo4j.attributions[key] !== src) {
      diffs.push({
        kind: 'attribution_mismatch',
        detail: `${key}: supabase=${src} neo4j=${neo4j.attributions[key]}`,
      });
    }
  }

  return diffs;
}

// ─── Live snapshot builders ─────────────────────────────────

export async function buildSupabaseSnapshot(
  db: Awaited<ReturnType<typeof getDb>>,
): Promise<ModelSnapshot> {
  const [classRows, instanceRows, relTypeRows, edgeRows, valueRows, attrRows] =
    await Promise.all([
      db.query.classes.findMany({ columns: { id: true } }),
      db.query.instances.findMany({ columns: { id: true } }),
      db.query.relationTypes.findMany({ columns: { id: true } }),
      db.query.edges.findMany({ columns: { id: true } }),
      db.query.instanceValues.findMany({
        columns: { instanceId: true, value: true },
        with: { property: { columns: { name: true } } },
      }),
      db.query.attributions.findMany({
        columns: {
          targetTable: true,
          targetId: true,
          sourceType: true,
          createdAt: true,
        },
      }),
    ]);

  const valuesByInstance: Record<string, Array<[string, unknown]>> = {};
  for (const v of valueRows) {
    (valuesByInstance[v.instanceId] ??= []).push([
      v.property?.name ?? '?',
      v.value,
    ]);
  }
  const instanceValuesSig: Record<string, string> = {};
  for (const [id, pairs] of Object.entries(valuesByInstance)) {
    instanceValuesSig[id] = valueSignature(pairs);
  }

  // 최신 어트리뷰션이 남도록 정렬 후 덮어쓰기
  const sortedAttr = [...attrRows].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const attributionsSig: Record<string, string> = {};
  for (const a of sortedAttr) {
    attributionsSig[`${a.targetTable}:${a.targetId}`] = a.sourceType;
  }

  return {
    counts: {
      classes: classRows.length,
      instances: instanceRows.length,
      relationTypes: relTypeRows.length,
      edges: edgeRows.length,
    },
    instanceValues: instanceValuesSig,
    attributions: attributionsSig,
  };
}

export async function buildNeo4jSnapshot(
  session: Session,
): Promise<ModelSnapshot> {
  const countOf = async (cypher: string): Promise<number> => {
    const res = await session.run(cypher);
    const v = res.records[0]?.get('c');
    return typeof v === 'object' && v !== null && 'toNumber' in v
      ? (v as { toNumber(): number }).toNumber()
      : Number(v ?? 0);
  };

  const [classCount, instanceCount, relTypeCount, edgeCount] = await Promise.all([
    countOf('MATCH (n:Class) RETURN count(n) AS c'),
    countOf('MATCH (n:Instance) RETURN count(n) AS c'),
    countOf('MATCH (n:RelationType) RETURN count(n) AS c'),
    countOf(
      'MATCH ()-[r]->() WHERE r.id IS NOT NULL AND NOT type(r) IN ["IS_A","INSTANCE_OF"] RETURN count(r) AS c',
    ),
  ]);

  // 인스턴스 평탄화 값 + 출처
  const instanceValuesSig: Record<string, string> = {};
  const attributionsSig: Record<string, string> = {};

  const instRes = await session.run(
    'MATCH (n:Instance) RETURN n.id AS id, properties(n) AS props',
  );
  for (const rec of instRes.records) {
    const id = rec.get('id') as string;
    const props = rec.get('props') as Record<string, unknown>;
    instanceValuesSig[id] = valueSignature(Object.entries(props));
    if (props._src != null) attributionsSig[`instances:${id}`] = String(props._src);
  }

  // 클래스/관계타입 출처
  const nodeAttr = await session.run(
    'MATCH (n) WHERE (n:Class OR n:RelationType) AND n._src IS NOT NULL ' +
      'RETURN n.id AS id, n._src AS src, labels(n) AS labels',
  );
  for (const rec of nodeAttr.records) {
    const id = rec.get('id') as string;
    const src = rec.get('src');
    const labels = rec.get('labels') as string[];
    const table = labels.includes('Class') ? 'classes' : 'relation_types';
    if (src != null) attributionsSig[`${table}:${id}`] = String(src);
  }

  // 엣지 출처
  const edgeAttr = await session.run(
    'MATCH ()-[r]->() WHERE r._src IS NOT NULL RETURN r.id AS id, r._src AS src',
  );
  for (const rec of edgeAttr.records) {
    const id = rec.get('id') as string;
    const src = rec.get('src');
    if (id != null && src != null) attributionsSig[`edges:${id}`] = String(src);
  }

  return {
    counts: {
      classes: classCount,
      instances: instanceCount,
      relationTypes: relTypeCount,
      edges: edgeCount,
    },
    instanceValues: instanceValuesSig,
    attributions: attributionsSig,
  };
}
