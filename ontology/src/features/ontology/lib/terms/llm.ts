import { generateText, Output, wrapLanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { parseCacheMiddleware } from '@/lib/llm/cache-middleware';
import { LLM_MODELS, LLM_MAX_RETRIES } from '@/lib/llm/models';
import { maskIdentifiers } from '@/features/ontology/lib/identifier-mask';
import { webSearch, isWebSearchAvailable } from '@/features/ontology/lib/web-search';
import { buildContextQuery, type ContextQueryInput } from './context-query';
import { buildResolveSystem, buildResolveUser } from './resolve-prompts';
import { termResolveLlmResponseSchema, type TermCandidate } from './types';
import type { ContextResolveFn, WebResolveFn } from './resolve';

// PRD-H (H4/M3): 용어 해소의 실제 LLM/웹 배선. 해소=정밀 모델(primary),
// 캐싱 미들웨어로 재현성. 웹은 opt-in 이며 사내 식별자를 마스킹한 뒤 질의한다.

const MAX_OUTPUT_TOKENS = 3000;

const primaryModel = wrapLanguageModel({
  model: openai(LLM_MODELS.primary),
  middleware: parseCacheMiddleware,
});

async function runResolve(
  input: ContextQueryInput,
  webSnippets: string[],
): Promise<TermCandidate[]> {
  const { output } = await generateText({
    model: primaryModel,
    providerOptions: { openai: { reasoningEffort: 'medium', textVerbosity: 'low' } },
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: LLM_MAX_RETRIES,
    output: Output.object({ schema: termResolveLlmResponseSchema }),
    system: buildResolveSystem(),
    prompt: buildResolveUser(input, webSnippets),
  });
  // source 는 맥락 근거이므로 'context' 로 고정(웹 후보는 webResolve 에서 별도 부착).
  return (output?.candidates ?? []).map((c) => ({ ...c, source: 'context' as const }));
}

// ② 현재 온톨로지 맥락 기반 해소.
export const contextResolve: ContextResolveFn = (input) => runResolve(input, []);

// ③ opt-in 웹 해소. 마스킹한 맥락 질의로 검색 → 스니펫을 근거로 후보 생성(검증 필요).
export const webResolve: WebResolveFn = async (query, input) => {
  if (!isWebSearchAvailable()) return [];
  const masked = maskIdentifiers(query);
  const results = await webSearch(masked, 3);
  if (results.length === 0) return [];
  const snippets = results.map((r) => `${r.title}: ${r.content}`);
  const candidates = await runResolve(input, snippets);
  // 웹 스니펫 근거 → source='web', 신뢰도 상한(사람 검증 전제).
  return candidates.map((c) => ({
    ...c,
    source: 'web' as const,
    confidence: Math.min(c.confidence, 0.6),
    rationale: c.rationale?.trim()
      ? `${c.rationale} (웹 스니펫 근거 · 검증 필요)`
      : '웹 스니펫 근거 · 검증 필요',
  }));
};

// 라우트에서 쓰는 배치 헬퍼 참조를 한 곳에.
export { buildContextQuery };
