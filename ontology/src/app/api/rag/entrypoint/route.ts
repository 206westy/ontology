import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getNeo4jDriver } from '@/lib/neo4j/client';
import { VECTOR_INDEX_NAME } from '@/lib/neo4j/schema';
import { embedOne } from '@/features/ontology/lib/embedding';
import { handleApiError } from '@/lib/api-error';

// PRD-E P2-3: RAG 진입점 — 질문 임베딩 → :Concept 벡터검색 top-k → 진입 노드.
// PRD-N M2: partitionId 지정 시 진입 노드를 그 구획으로 스코프(무관 구획 오염 방지).
const requestSchema = z.object({
  question: z.string().min(1),
  k: z.number().int().min(1).max(50).optional().default(5),
  partitionId: z.string().optional(),
});

// 벡터 인덱스는 queryNodes 내부 WHERE 를 지원하지 않으므로, 스코프 시 후보를 넉넉히
// 뽑아(over-fetch) partition 으로 거른 뒤 상위 k 만 남긴다.
const SCOPE_OVERSAMPLE = 5;

export interface RagEntryNode {
  id: string;
  name: string;
  labels: string[];
  partition: string | null;
  score: number;
}

export async function POST(request: NextRequest) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { question, k, partitionId } = parsed.data;
    const scoped = !!partitionId;

    const vector = await embedOne(question);

    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const cypher = scoped
        ? `CALL db.index.vector.queryNodes($index, toInteger($overfetch), $vector)
           YIELD node, score
           WHERE node.partition = $partition
           RETURN node.id AS id, node.name AS name, labels(node) AS labels, node.partition AS partition, score
           ORDER BY score DESC
           LIMIT toInteger($k)`
        : `CALL db.index.vector.queryNodes($index, toInteger($k), $vector)
           YIELD node, score
           RETURN node.id AS id, node.name AS name, labels(node) AS labels, node.partition AS partition, score
           ORDER BY score DESC`;
      const params = scoped
        ? { index: VECTOR_INDEX_NAME, k, overfetch: k * SCOPE_OVERSAMPLE, vector, partition: partitionId }
        : { index: VECTOR_INDEX_NAME, k, vector };

      const res = await session.run(cypher, params);
      const entryNodes: RagEntryNode[] = res.records.map((r) => ({
        id: r.get('id'),
        name: r.get('name'),
        labels: r.get('labels'),
        partition: r.get('partition') ?? null,
        score: r.get('score'),
      }));
      return NextResponse.json({ entryNodes, scoped });
    } finally {
      await session.close();
    }
  } catch (err) {
    return handleApiError(err);
  }
}
