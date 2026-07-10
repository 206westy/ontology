import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { handleApiError } from '@/lib/api-error';

// 의미 유사 엣지: 엣지가 없어도 임베딩(cosine)이 가까운 노드쌍을 "의미 링크"로 반환.
// 클라이언트가 실제 관계 엣지 ∪ 의미 엣지로 군집을 산출 → 관련 의미끼리 같은 군집·색.
// 무거운 1536D 임베딩은 서버에 머물고, 반환은 id 쌍(경량)뿐.

// ids(uuid 문자열 배열)를 PG uuid[] 파라미터로 안전 바인딩. 원시 `= ANY(${ids})`는
// 배열로 바인딩되지 않아 42809(op ANY/ALL requires array on right side)를 낸다.
const idArray = (ids: string[]) =>
  ids.length > 0
    ? sql`ARRAY[${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}]`
    : sql`ARRAY[]::uuid[]`;

const bodySchema = z.object({ ids: z.array(z.string()).min(1).max(4000) });

// text-embedding-3-small 기준 "의미상 관련" 문턱. 낮추면 군집이 뭉치고 높이면 잘게 쪼개진다.
const SIM_THRESHOLD = 0.8;
const K_PER_NODE = 5;
// 전수 비교(O(N²·1536))를 JS로 수행 — 온톨로지 규모(수백)에선 즉시. 폭주 방지 상한.
const MAX_NODES = 1500;

interface EmbeddedNode {
  id: string;
  vec: Float64Array; // L2 정규화된 임베딩
}

function parseAndNormalize(id: string, raw: string): EmbeddedNode | null {
  // pgvector embedding::text = "[0.1,0.2,...]" → number[]
  let arr: number[];
  try {
    arr = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const vec = new Float64Array(arr.length);
  let norm = 0;
  for (let i = 0; i < arr.length; i++) norm += arr[i] * arr[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < arr.length; i++) vec[i] = arr[i] / norm;
  return { id, vec };
}

function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // 정규화 완료 → 내적 = 코사인 유사도
}

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { ids } = parsed.data;
    if (ids.length > MAX_NODES) {
      // 대규모에선 의미 링크 생략(구조 군집으로 폴백) — 조용한 절단 대신 명시.
      return NextResponse.json({ edges: [], skipped: 'too_many_nodes', total: ids.length });
    }

    const db = await getDb();
    const rows = (await db.execute(sql`
      SELECT id::text AS id, embedding::text AS emb FROM classes
        WHERE id = ANY(${idArray(ids)}) AND embedding IS NOT NULL
      UNION ALL
      SELECT id::text AS id, embedding::text AS emb FROM instances
        WHERE id = ANY(${idArray(ids)}) AND embedding IS NOT NULL
    `)) as unknown as Array<{ id: string; emb: string }>;

    const nodes: EmbeddedNode[] = [];
    for (const r of rows) {
      const n = parseAndNormalize(r.id, r.emb);
      if (n) nodes.push(n);
    }

    // 각 노드의 top-k(문턱 이상) 이웃을 무방향 쌍으로 수집(중복 제거).
    const seen = new Set<string>();
    const edges: Array<{ source: string; target: string }> = [];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const scored: Array<{ id: string; sim: number }> = [];
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const sim = cosine(a.vec, nodes[j].vec);
        if (sim >= SIM_THRESHOLD) scored.push({ id: nodes[j].id, sim });
      }
      scored.sort((p, q) => q.sim - p.sim);
      for (const { id: bId } of scored.slice(0, K_PER_NODE)) {
        const key = a.id < bId ? `${a.id}|${bId}` : `${bId}|${a.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ source: a.id, target: bId });
      }
    }

    return NextResponse.json({ edges, coverage: { withEmbedding: nodes.length, requested: ids.length } });
  } catch (err) {
    return handleApiError(err);
  }
}
