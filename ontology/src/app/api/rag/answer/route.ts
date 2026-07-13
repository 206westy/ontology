import { NextRequest, NextResponse } from 'next/server';
import { generateText, Output } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getNeo4jDriver } from '@/lib/neo4j/client';
import { VECTOR_INDEX_NAME } from '@/lib/neo4j/schema';
import { embedOne } from '@/features/ontology/lib/embedding';
import { LLM_MODELS, LLM_MAX_RETRIES } from '@/lib/llm/models';
import {
  ragAnswerRequestSchema,
  ragAnswerLlmSchema,
} from '@/features/ontology/lib/schemas';
import {
  buildTraversalCypher,
  shapeEvidencePaths,
  collectProvenance,
  pathsToPromptText,
  DEFAULT_PATH_LIMIT,
  type EvidencePath,
  type Provenance,
} from '@/features/ontology/lib/rag/traverse';

// PRD-N M4 (Operator): 진단형 RAG. 진입(벡터·구획 스코프) → 구획 스코프 그래프 탐색
// (가드레일: 경로 전체가 현재 구획) → 근거경로·provenance 수집 → LLM 종합 1회.
// 모든 결론에 추적 가능한 경로+출처를 붙이고, 경로 밖은 "모델에 근거 없음"으로 분리한다.
const ENTRY_OVERSAMPLE = 5;

interface RagAnswerResponse {
  answer: string;
  paths: EvidencePath[];
  sources: Provenance[];
  grounded: boolean;
  ungroundedNote: string | null;
  entryCount: number;
}

async function findEntryIds(
  vector: number[],
  k: number,
  partitionId: string | null,
): Promise<string[]> {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const cypher = partitionId
      ? `CALL db.index.vector.queryNodes($index, toInteger($overfetch), $vector)
         YIELD node, score
         WHERE node.partition = $partition
         RETURN node.id AS id ORDER BY score DESC LIMIT toInteger($k)`
      : `CALL db.index.vector.queryNodes($index, toInteger($k), $vector)
         YIELD node, score
         RETURN node.id AS id ORDER BY score DESC`;
    const params = partitionId
      ? { index: VECTOR_INDEX_NAME, k, overfetch: k * ENTRY_OVERSAMPLE, vector, partition: partitionId }
      : { index: VECTOR_INDEX_NAME, k, vector };
    const res = await session.run(cypher, params);
    return res.records.map((r) => r.get('id') as string).filter(Boolean);
  } finally {
    await session.close();
  }
}

async function traverse(
  entryIds: string[],
  partitionId: string | null,
  maxDepth: number,
): Promise<EvidencePath[]> {
  const { cypher, params } = buildTraversalCypher(entryIds, {
    partition: partitionId,
    maxDepth,
    limit: DEFAULT_PATH_LIMIT,
  });
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const result = await session.executeRead((tx) => tx.run(cypher, params));
    const rows = result.records.map((r) => ({
      nodes: r.get('nodes'),
      edges: r.get('edges'),
    }));
    return shapeEvidencePaths(rows);
  } finally {
    await session.close();
  }
}

async function synthesize(
  question: string,
  paths: EvidencePath[],
): Promise<{ answer: string; hasUngrounded: boolean; ungroundedNote: string | null }> {
  const system = `당신은 온톨로지 그래프에 대한 질문에 답한다. 아래 "근거경로"는 사용자의 구획 범위 안에서 그래프로부터 검색된 것이다.
- 오직 이 경로들만 근거로 답하라. 개념은 이름으로 인용하라.
- 경로에 답할 근거가 부족하면 hasUngrounded=true 로 두고 부족한 점을 ungroundedNote(한국어)에 적어라. 경로 밖 사실을 지어내지 마라(모델에 근거 없음).
- 답변은 간결한 한국어.`;
  const prompt = `질문: ${question}\n\n${pathsToPromptText(paths)}`;

  const result = await generateText({
    model: openai(LLM_MODELS.primary),
    providerOptions: { openai: { reasoningEffort: 'low', textVerbosity: 'low' } },
    maxOutputTokens: 4000,
    maxRetries: LLM_MAX_RETRIES,
    output: Output.object({ schema: ragAnswerLlmSchema }),
    system,
    prompt,
  });
  const out = result.output;
  if (!out) throw new Error('빈 응답');
  return {
    answer: out.answer,
    hasUngrounded: out.hasUngrounded,
    ungroundedNote: out.ungroundedNote ?? null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ragAnswerRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { question, partitionId, k, maxDepth } = parsed.data;
    const scopeId = partitionId ?? null;

    const vector = await embedOne(question);
    const entryIds = await findEntryIds(vector, k, scopeId);

    if (entryIds.length === 0) {
      const empty: RagAnswerResponse = {
        answer: '현재 구획에서 이 질문과 관련된 개념을 찾지 못했습니다. 모델에 근거가 없습니다.',
        paths: [],
        sources: [],
        grounded: false,
        ungroundedNote: '관련 진입 개념 없음',
        entryCount: 0,
      };
      return NextResponse.json(empty);
    }

    const paths = await traverse(entryIds, scopeId, maxDepth);
    const sources = collectProvenance(paths);

    // LLM 종합. 실패해도 결정론 근거경로는 보존해 응답한다.
    let answer = '';
    let ungroundedNote: string | null = null;
    try {
      const synth = await synthesize(question, paths);
      answer = synth.answer;
      ungroundedNote = synth.hasUngrounded ? (synth.ungroundedNote ?? '일부 내용은 모델에 근거가 없습니다.') : null;
    } catch {
      answer = '답변 생성에 실패했지만 아래 근거경로를 확인할 수 있습니다.';
      ungroundedNote = null;
    }

    const response: RagAnswerResponse = {
      answer,
      paths,
      sources,
      grounded: paths.length > 0,
      ungroundedNote,
      entryCount: entryIds.length,
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
