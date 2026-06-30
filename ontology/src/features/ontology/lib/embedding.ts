import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';

// PRD-E P2-2: 단일 임베딩 정책 (docs/embedding-policy.md).
// text-embedding-3-small / 1536 / cosine. 서버 전용(OPENAI_API_KEY 필요).

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

interface NodeText {
  name: string;
  description?: string | null;
}

// 임베딩 대상 텍스트: name + " — " + description (타입·구획은 미포함, 필터로).
export function buildEmbeddingText(node: NodeText, extraValues: string[] = []): string {
  const parts = [node.name.trim()];
  const desc = (node.description ?? '').trim();
  if (desc) parts.push(desc);
  const vals = extraValues.map((v) => v.trim()).filter(Boolean);
  const base = parts.join(' — ');
  return vals.length > 0 ? `${base} (${vals.join(', ')})` : base;
}

// 여러 텍스트를 한 번에 임베딩. 입력 순서대로 number[][] 반환.
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { embeddings } = await embedMany({
    model: openai.embedding(EMBEDDING_MODEL),
    values: texts,
  });
  return embeddings;
}

// 단일 텍스트 임베딩 (dedup/RAG 진입점 질의용).
export async function embedOne(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}
