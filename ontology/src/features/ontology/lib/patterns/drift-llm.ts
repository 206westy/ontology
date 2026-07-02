import { generateText, Output, wrapLanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { parseCacheMiddleware } from '@/lib/llm/cache-middleware';
import { LLM_MODELS, LLM_MAX_RETRIES } from '@/lib/llm/models';
import { buildDriftSystem, buildDriftUser } from './drift-prompts';
import {
  judgeDrift,
  judgeDriftBatch,
  driftLlmJudgmentSchema,
  type AlignFn,
  type DomainFitFn,
  type DriftDeps,
  type DriftElement,
  type DriftJudgment,
  type DriftPatternContext,
} from './drift';

// PRD-H (H5/M4): 드리프트 판정의 실제 LLM 배선. 판정=정밀 모델(primary),
// 캐싱 미들웨어로 재현성. 요소당 1회 호출로 원시 판정을 받아 순수 judgeDrift 의
// 임계값·분기 로직에 넘긴다(임계값 단일 출처).

const MAX_OUTPUT_TOKENS = 2000;

const primaryModel = wrapLanguageModel({
  model: openai(LLM_MODELS.primary),
  middleware: parseCacheMiddleware,
});

async function runDriftJudge(element: DriftElement, ctx: DriftPatternContext) {
  const { output } = await generateText({
    model: primaryModel,
    providerOptions: { openai: { reasoningEffort: 'medium', textVerbosity: 'low' } },
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: LLM_MAX_RETRIES,
    output: Output.object({ schema: driftLlmJudgmentSchema }),
    system: buildDriftSystem(),
    prompt: buildDriftUser(element, ctx),
  });
  return (
    output ?? {
      alignedName: null,
      alignedKind: null,
      alignScore: 0,
      inDomain: false,
      rationale: '판정 실패 — 보수적으로 분기 후보로 표시합니다.',
      confidence: 0,
    }
  );
}

// LLM 원시 판정을 judgeDrift 의 주입 의존성으로 감싼다(임계값은 judgeDrift 가 적용).
function depsFromLlm(element: DriftElement, ctx: DriftPatternContext): DriftDeps {
  const rawPromise = runDriftJudge(element, ctx);
  const alignFn: AlignFn = async () => {
    const raw = await rawPromise;
    if (raw.alignedName && raw.alignedKind) {
      return { kind: raw.alignedKind, name: raw.alignedName, score: raw.alignScore };
    }
    return null;
  };
  const domainFitFn: DomainFitFn = async () => {
    const raw = await rawPromise;
    return { inDomain: raw.inDomain, rationale: raw.rationale, confidence: raw.confidence };
  };
  return { alignFn, domainFitFn };
}

export function judgeDriftWithLlm(
  element: DriftElement,
  ctx: DriftPatternContext,
): Promise<DriftJudgment> {
  return judgeDrift(element, ctx, depsFromLlm(element, ctx));
}

// 배치: 요소별로 LLM 판정을 병렬 실행.
export function judgeDriftBatchWithLlm(
  elements: DriftElement[],
  ctx: DriftPatternContext,
): Promise<DriftJudgment[]> {
  return Promise.all(elements.map((el) => judgeDriftWithLlm(el, ctx)));
}

// 배치 순수 헬퍼 재노출(라우트 편의).
export { judgeDriftBatch };
