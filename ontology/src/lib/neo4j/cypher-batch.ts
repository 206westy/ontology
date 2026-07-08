import {
  buildCypherStatements,
  type CommitDetail,
  type CypherStatement,
  type PushContext,
} from '@/lib/neo4j/cypher-builder';

// ─── PRD-M M1: 변경로그 생애주기 압축 ────────────────────────────
// 발행 배치 안에서 같은 대상(targetTable:targetId)의 변경 이력을 순 변화로 접는다.
//   ADD → (MOD…) → DEL  : 전부 소거 (배치 안에서 태어나고 죽음 → Neo4j 미반영)
//   MOD → MOD → …       : 마지막 스냅샷 1건으로 병합 (last-write-wins)
//   ADD → MOD…          : ADD 1건에 마지막 스냅샷 반영
//   DEL → ADD(재생성)    : 단일 upsert (MERGE 라 ADD/MOD 동일 구문)
// 전제: details 가 시간순이고, 배치 내 ADD 는 아직 Neo4j 에 반영되지 않았다
// (기발행 커밋 재푸시가 섞이면 호출부에서 압축을 건너뛴다 — push 라우트 가드 참조).

export function compressDetails(details: CommitDetail[]): CommitDetail[] {
  const byTarget = new Map<string, CommitDetail[]>();
  const order: string[] = [];
  for (const d of details) {
    const key = `${d.targetTable}:${d.targetId}`;
    const seq = byTarget.get(key);
    if (seq) {
      seq.push(d);
    } else {
      byTarget.set(key, [d]);
      order.push(key);
    }
  }

  const out: CommitDetail[] = [];
  for (const key of order) {
    const seq = byTarget.get(key)!;
    if (seq.length === 1) {
      out.push(seq[0]);
      continue;
    }
    const first = seq[0];
    const last = seq[seq.length - 1];
    const bornInBatch = first.operation === 'ADD';

    if (last.operation === 'DEL') {
      if (bornInBatch) continue; // 상쇄: 생성→삭제
      out.push({ ...last, beforeSnapshot: first.beforeSnapshot ?? last.beforeSnapshot });
      continue;
    }

    out.push({
      ...last,
      operation: bornInBatch ? 'ADD' : 'MOD',
      beforeSnapshot: first.beforeSnapshot ?? null,
      afterSnapshot: last.afterSnapshot,
    });
  }
  return out;
}

// ─── PRD-M M2: UNWIND 배칭 ──────────────────────────────────────
// 개별 구문을 쿼리 템플릿 단위로 묶어 `UNWIND $rows` 단일 구문으로 병합한다.
// 왕복 횟수가 O(변경 건수) → O(구문 형태 수)로 준다.
// 같은 params 키를 그대로 row 로 실어 나르므로 생성 로직 중복이 없다.

export const BATCH_MAX_ROWS = 1000;

// 템플릿별 실행 우선순위. 그룹핑으로 순서가 재배열되어도 의존성이 깨지지 않게
// 고정한다. 특히 관계 delete(재배선용)는 반드시 같은 종류의 merge 보다 앞선다 —
// 첫 등장 순서에 맡기면 "ADD 의 merge 그룹이 먼저 생기고 MOD 의 delete 가 뒤에
// 실행되어 방금 만든 관계를 지우는" 역전이 생긴다.
function templatePriority(query: string): number {
  if (query.includes('MERGE (n:Class')) return 10;
  if (query.includes('SET c.propsSchema')) return 15;
  if (query.includes('[r:IS_A]') && query.includes('DELETE r')) return 20;
  if (query.includes('MERGE (child)-[:IS_A]')) return 21;
  if (query.includes('MERGE (rt:RelationType')) return 30;
  if (query.includes('MERGE (n:Instance')) return 40;
  if (query.includes('[r:INSTANCE_OF]') && query.includes('DELETE r')) return 50;
  if (query.includes('MERGE (i)-[:INSTANCE_OF]')) return 51;
  if (query.startsWith('MATCH (i:Instance') && query.includes('SET i.')) return 60;
  if (query.startsWith('MATCH (i:Instance') && query.includes('REMOVE i.')) return 61;
  if (query.includes('MERGE (a)-[r:')) return 70;
  if (query.startsWith('MATCH ()-[r {id:') && query.includes('DELETE r')) return 80;
  if (query.includes('(n:Instance') && query.includes('DETACH DELETE')) return 81;
  if (query.includes('(n:Class') && query.includes('DETACH DELETE')) return 82;
  if (query.includes('(rt:RelationType') && query.includes('DETACH DELETE')) return 83;
  return 900; // 미분류: 맨 뒤, 등장 순서 유지, 배칭은 그대로 적용
}

// `$param` → `row.param` 치환. 현행 템플릿은 전부 단순 파라미터만 사용한다.
function toRowQuery(query: string): string {
  return `UNWIND $rows AS row ${query.replace(/\$(\w+)/g, 'row.$1')}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// 설명 요약: "클래스 "A" 생성 외 11건" 식으로 접는다.
function summarizeDescriptions(descriptions: string[]): string {
  if (descriptions.length === 1) return descriptions[0];
  return `${descriptions[0]} 외 ${descriptions.length - 1}건`;
}

export function batchStatements(statements: CypherStatement[]): CypherStatement[] {
  interface Group {
    query: string;
    priority: number;
    firstIndex: number;
    rows: Record<string, unknown>[];
    descriptions: string[];
  }
  const groups = new Map<string, Group>();
  for (let i = 0; i < statements.length; i++) {
    const s = statements[i];
    let g = groups.get(s.query);
    if (!g) {
      g = {
        query: s.query,
        priority: templatePriority(s.query),
        firstIndex: i,
        rows: [],
        descriptions: [],
      };
      groups.set(s.query, g);
    }
    g.rows.push(s.params);
    g.descriptions.push(s.description);
  }

  const ordered = [...groups.values()].sort(
    (a, b) => a.priority - b.priority || a.firstIndex - b.firstIndex,
  );

  const out: CypherStatement[] = [];
  for (const g of ordered) {
    if (g.rows.length === 1) {
      out.push({ query: g.query, params: g.rows[0], description: g.descriptions[0] });
      continue;
    }
    for (const rows of chunk(g.rows, BATCH_MAX_ROWS)) {
      out.push({
        query: toRowQuery(g.query),
        params: { rows },
        description: summarizeDescriptions(g.descriptions),
      });
    }
  }
  return out;
}

// ─── 발행용 통합 빌더: 압축 → 개별 구문 생성 → 배칭 ───────────────
export function buildBatchedCypherStatements(
  details: CommitDetail[],
  context: PushContext | undefined,
  options?: { compress?: boolean },
): CypherStatement[] {
  const compressed = options?.compress === false ? details : compressDetails(details);
  return batchStatements(buildCypherStatements(compressed, context));
}

// ─── PRD-M M4: 배칭 인지 프리뷰 ─────────────────────────────────
// rows 파라미터를 통째로 치환하면 프리뷰가 폭발하므로, 배치 구문은
// "쿼리 + 행 수 + 첫 행 샘플(임베딩 등 대형 배열은 축약)" 로 요약한다.

function compactValue(value: unknown): unknown {
  if (Array.isArray(value) && value.length > 8) {
    return `[…${value.length}개]`;
  }
  return value;
}

function compactRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, compactValue(v)]));
}

export function formatBatchedCypherPreview(statements: CypherStatement[]): string {
  return statements
    .map((s) => {
      const rows = s.params.rows;
      if (Array.isArray(rows)) {
        const sample = JSON.stringify(compactRow(rows[0] as Record<string, unknown>));
        return `// ${s.description}\n// rows: ${rows.length}건, 예시 ${sample}\n${s.query};`;
      }
      let query = s.query;
      for (const [key, value] of Object.entries(s.params)) {
        query = query.replace(`$${key}`, JSON.stringify(compactValue(value)));
      }
      return `// ${s.description}\n${query};`;
    })
    .join('\n\n');
}
