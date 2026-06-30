import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getNeo4jDriver } from '@/lib/neo4j/client';
import { VECTOR_INDEX_NAME } from '@/lib/neo4j/schema';
import { embedOne } from '@/features/ontology/lib/embedding';
import { handleApiError } from '@/lib/api-error';

// PRD-E P2-3: RAG 진입점 — 질문 임베딩 → :Concept 벡터검색 top-k → 진입 노드.
const requestSchema = z.object({
  question: z.string().min(1),
  k: z.number().int().min(1).max(50).optional().default(5),
});

export interface RagEntryNode {
  id: string;
  name: string;
  labels: string[];
  score: number;
}

export async function POST(request: NextRequest) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { question, k } = parsed.data;

    const vector = await embedOne(question);

    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run(
        `CALL db.index.vector.queryNodes($index, $k, $vector)
         YIELD node, score
         RETURN node.id AS id, node.name AS name, labels(node) AS labels, score
         ORDER BY score DESC`,
        { index: VECTOR_INDEX_NAME, k, vector },
      );
      const entryNodes: RagEntryNode[] = res.records.map((r) => ({
        id: r.get('id'),
        name: r.get('name'),
        labels: r.get('labels'),
        score: r.get('score'),
      }));
      return NextResponse.json({ entryNodes });
    } finally {
      await session.close();
    }
  } catch (err) {
    return handleApiError(err);
  }
}
