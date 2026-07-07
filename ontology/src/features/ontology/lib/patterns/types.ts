import { z } from 'zod';
import { relationLayerEnum, type RelationLayer } from '../schemas';

// PRD-H (H1/M1): 패턴 = 번들(역할+관계+CQ+traversal). 학습형 캐시의 1급 자산.
// 발견 방식(method)·출처·라이선스를 함께 들고 다녀 재현·수렴·발행 게이트를 지원한다.

export type PatternMethod = 'retrieved' | 'adapted' | 'synthesized' | 'bootstrap';

export interface PatternRole {
  name: string;
  nodeKind: 'class';
  description: string;
}

export interface PatternRelationType {
  name: string;
  layer: RelationLayer;
  sourceRole: string;
  targetRole: string;
}

export interface PatternTraversalTemplate {
  cq: string;
  path: string;
}

export interface Pattern {
  id: string;
  key: string;
  name: string;
  nameKo: string;
  version: number;
  domain: string;
  roles: PatternRole[];
  relationTypes: PatternRelationType[];
  competencyQuestions: string[];
  traversalTemplates: PatternTraversalTemplate[];
  method: PatternMethod;
  sourceRepo: string | null;
  sourceUri: string | null;
  sourceLabel: string | null;
  license: string | null;
  isDraft: boolean;
  previousVersionId: string | null;
  createdAt: string;
}

// ─── LLM-facing schemas (OpenAI strict structured output) ───────────────
// strict 모드: 모든 필드 required + nullable(never optional) — schemas.ts 486-490 규칙.

export const patternRoleSchema = z.object({
  name: z.string().min(1),
  nodeKind: z.literal('class'),
  description: z.string(),
});

export const patternRelationTypeSchema = z.object({
  name: z.string().min(1),
  layer: relationLayerEnum,
  sourceRole: z.string().min(1),
  targetRole: z.string().min(1),
});

export const patternTraversalTemplateSchema = z.object({
  cq: z.string().min(1),
  path: z.string().min(1),
});

// adapt/synthesize 가 내놓는 번들(캐시 DB 필드 제외).
export const patternBundleSchema = z.object({
  name: z.string().min(1),
  nameKo: z.string(),
  roles: z.array(patternRoleSchema),
  relationTypes: z.array(patternRelationTypeSchema),
  competencyQuestions: z.array(z.string()),
  traversalTemplates: z.array(patternTraversalTemplateSchema),
});

export type PatternBundle = z.infer<typeof patternBundleSchema>;

// H2: 도메인 인지 결과(mini 모델). 추출 전 요약 게이트까지만.
export const patternMixtureItemSchema = z.object({
  domain: z.string(),
  ratio: z.number().min(0).max(1),
});

export const recognizeResultSchema = z.object({
  domain: z.string().min(1),
  domainKo: z.string(),
  confidence: z.number().min(0).max(1),
  mixture: z.array(patternMixtureItemSchema),
  recommendedPatternKey: z.string().nullable(),
  competencyQuestionPreview: z.array(z.string()),
});

export type RecognizeResult = z.infer<typeof recognizeResultSchema>;
export type PatternMixtureItem = z.infer<typeof patternMixtureItemSchema>;

// ─── API request schemas ────────────────────────────────────────────────
export const discoverPatternRequestSchema = z.object({
  text: z.string().min(1),
});

export type DiscoverPatternRequestInput = z.infer<
  typeof discoverPatternRequestSchema
>;

const patternMethodEnum = z.enum([
  'retrieved',
  'adapted',
  'synthesized',
  'bootstrap',
]);

// 승격(promote): 발견/조정된 초안 번들을 캐시에 영속화.
export const promotePatternRequestSchema = patternBundleSchema.extend({
  key: z.string().min(1),
  domain: z.string().min(1),
  method: patternMethodEnum.default('synthesized'),
  sourceRepo: z.string().nullable().optional(),
  sourceUri: z.string().nullable().optional(),
  sourceLabel: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
});

export type PromotePatternRequestInput = z.infer<
  typeof promotePatternRequestSchema
>;

export { patternMethodEnum };
