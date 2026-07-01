import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { sql } from 'drizzle-orm';
import { dedupCandidatesRequestSchema } from '@/features/ontology/lib/schemas';
import { embedOne } from '@/features/ontology/lib/embedding';
import { handleApiError } from '@/lib/api-error';
import { combinedMatchScore } from '@/lib/entity-match/score';
import type { DedupCandidate } from '@/features/ontology/lib/schemas';

// PRD-E P2-4: 편집 시점 중복 후보 — pgvector 의미검색 top-k ∪ trigram 오타검색.
// 자동 병합 금지. 후보만 반환 → /api/llm/resolve 가 판정.
export async function POST(request: NextRequest) {
  try {
    const parsed = dedupCandidatesRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { text, kind, k } = parsed.data;

    const vector = await embedOne(text);
    const vecLiteral = `[${vector.join(',')}]`;
    const db = await getDb();

    const tables: Array<'classes' | 'instances'> = [];
    if (kind === 'both' || kind === 'class') tables.push('classes');
    if (kind === 'both' || kind === 'instance') tables.push('instances');

    const byId = new Map<string, DedupCandidate>();

    for (const table of tables) {
      const nodeKind = table === 'classes' ? 'class' : 'instance';
      const tbl = sql.raw(table);

      // 1) 의미 기반 (cosine) top-k
      const vecRows = (await db.execute(sql`
        SELECT id::text AS id, name, 1 - (embedding <=> ${vecLiteral}::vector) AS score
        FROM ${tbl}
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${vecLiteral}::vector
        LIMIT ${k}
      `)) as unknown as Array<{ id: string; name: string; score: number }>;

      for (const r of vecRows) {
        byId.set(r.id, {
          id: r.id,
          name: r.name,
          kind: nodeKind,
          vectorScore: Number(r.score),
          trigramScore: null,
        });
      }

      // 2) 오타 기반 (trigram)
      const trgRows = (await db.execute(sql`
        SELECT id::text AS id, name, similarity(name, ${text}) AS sim
        FROM ${tbl}
        WHERE name % ${text}
        ORDER BY similarity(name, ${text}) DESC
        LIMIT ${k}
      `)) as unknown as Array<{ id: string; name: string; sim: number }>;

      for (const r of trgRows) {
        const existing = byId.get(r.id);
        if (existing) {
          existing.trigramScore = Number(r.sim);
        } else {
          byId.set(r.id, {
            id: r.id,
            name: r.name,
            kind: nodeKind,
            vectorScore: null,
            trigramScore: Number(r.sim),
          });
        }
      }
    }

    // H5: 공통 결합 점수(vec+trigram 가중)로 정렬 — 엔드포인트 간 일관된 순위.
    const candidates = [...byId.values()].sort(
      (a, b) =>
        combinedMatchScore(b.vectorScore, b.trigramScore) -
        combinedMatchScore(a.vectorScore, a.trigramScore),
    );

    return NextResponse.json({ candidates });
  } catch (err) {
    return handleApiError(err);
  }
}
