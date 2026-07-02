import { generateText, Output, wrapLanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { parseCacheMiddleware } from '@/lib/llm/cache-middleware';
import { LLM_MODELS, LLM_MAX_RETRIES } from '@/lib/llm/models';
import {
  patternBundleSchema,
  recognizeResultSchema,
  type PatternBundle,
  type RecognizeResult,
} from './types';
import type {
  AdaptFn,
  DiscoverContext,
  RetrievedSeed,
  SynthesizeFn,
} from './discovery/provider';

// PRD-H (H2/H3, M1): 도메인 인지·적응·합성의 실제 LLM 배선.
// 인지=경량 모델(mini), 적응/합성=정밀 모델(primary). 캐싱 미들웨어로 재현성 확보.

const MAX_OUTPUT_TOKENS = 4000;

const miniModel = wrapLanguageModel({
  model: openai(LLM_MODELS.mini),
  middleware: parseCacheMiddleware,
});

const primaryModel = wrapLanguageModel({
  model: openai(LLM_MODELS.primary),
  middleware: parseCacheMiddleware,
});

const RECOGNIZE_SYSTEM = `너는 온톨로지 도메인 라우터다. 입력 텍스트를 보고 어떤 도메인인지 판정한다.
- domain: 영문 소문자 슬러그(예: diagnostic, administrative, catalog, organization, event).
- domainKo: 한국어 도메인명.
- confidence: 0~1.
- mixture: 혼합 도메인이면 각 도메인과 비율(합 ≈ 1). 단일이면 그 도메인 하나.
- recommendedPatternKey: 알 수 있으면 추천 패턴 key, 없으면 null.
- competencyQuestionPreview: 이 도메인에서 그래프가 답해야 할 대표 질문 2~4개(한국어).
추출은 하지 않는다. 요약·판정만. 근거 없으면 confidence 를 낮춘다.`;

export async function recognizeDomain(text: string): Promise<RecognizeResult> {
  const { output } = await generateText({
    model: miniModel,
    providerOptions: { openai: { reasoningEffort: 'low', textVerbosity: 'low' } },
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: LLM_MAX_RETRIES,
    output: Output.object({ schema: recognizeResultSchema }),
    system: RECOGNIZE_SYSTEM,
    prompt: `입력 텍스트:\n"""\n${text}\n"""\n\n도메인을 판정하라.`,
  });
  return (
    output ?? {
      domain: 'unknown',
      domainKo: '미확인',
      confidence: 0,
      mixture: [],
      recommendedPatternKey: null,
      competencyQuestionPreview: [],
    }
  );
}

const BUNDLE_SYSTEM = `너는 온톨로지 설계 패턴(ODP) 저자다. 도메인에 맞는 패턴 번들을 설계한다.
번들 = 역할(roles: 노드 타입, nodeKind 항상 'class') + 관계 타입(relationTypes: category 는
structural|causal|diagnostic|procedural|descriptive 중 하나, sourceRole/targetRole 는 roles 의 name)
+ competencyQuestions(그래프가 답해야 할 질문) + traversalTemplates(각 CQ 에 답하는 경로 표현).
관계 방향·의미를 정확히. 진단 도메인이면 증상→원인→점검→조치의 인과 계층을 반영한다.`;

const adaptFnImpl: AdaptFn = async (seed: RetrievedSeed, ctx: DiscoverContext) => {
  const { output } = await generateText({
    model: primaryModel,
    providerOptions: { openai: { reasoningEffort: 'medium', textVerbosity: 'low' } },
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: LLM_MAX_RETRIES,
    output: Output.object({ schema: patternBundleSchema }),
    system: BUNDLE_SYSTEM,
    prompt: `도메인: ${ctx.domain} (${ctx.domainKo})
저장소에서 발견한 참고 어휘: ${seed.label}
어휘 요약: ${seed.summary}
대표 질문(있으면 반영): ${ctx.competencyQuestions.join(' / ')}

이 참고 어휘를 도메인에 맞게 "적응"해 패턴 번들을 만들어라. 참고 어휘의 개념을 역할로 매핑하되, 도메인에 맞게 조정한다.`,
  });
  return output ?? emptyBundle(ctx);
};

const synthesizeFnImpl: SynthesizeFn = async (ctx: DiscoverContext) => {
  const { output } = await generateText({
    model: primaryModel,
    providerOptions: { openai: { reasoningEffort: 'medium', textVerbosity: 'low' } },
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: LLM_MAX_RETRIES,
    output: Output.object({ schema: patternBundleSchema }),
    system: BUNDLE_SYSTEM,
    prompt: `도메인: ${ctx.domain} (${ctx.domainKo})
대표 질문(있으면 반영): ${ctx.competencyQuestions.join(' / ')}
입력 맥락:
"""
${ctx.text.slice(0, 4000)}
"""

참고 어휘 없이 이 도메인의 온톨로지 관례에 맞는 패턴 번들을 "합성"하라.`,
  });
  return output ?? emptyBundle(ctx);
};

function emptyBundle(ctx: DiscoverContext): PatternBundle {
  return {
    name: ctx.domain,
    nameKo: ctx.domainKo,
    roles: [],
    relationTypes: [],
    competencyQuestions: ctx.competencyQuestions,
    traversalTemplates: [],
  };
}

export const adaptPattern = adaptFnImpl;
export const synthesizePattern = synthesizeFnImpl;
