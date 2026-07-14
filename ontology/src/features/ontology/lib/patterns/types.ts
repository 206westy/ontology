import { z } from 'zod';
import { relationLayerEnum, type RelationLayer } from '../schemas';

// PRD-H (H1/M1): 패턴 = 번들(역할+관계+CQ+traversal). 학습형 캐시의 1급 자산.
// 발견 방식(method)·출처·라이선스를 함께 들고 다녀 재현·수렴·발행 게이트를 지원한다.

export type PatternMethod = 'retrieved' | 'adapted' | 'synthesized' | 'bootstrap';

// PRD-BM-D01 (M1): 공유 스코프. 첫 공유 단위는 org(B2B 안전).
export type PatternVisibility = 'private' | 'org' | 'public';

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
  // PRD-BM-D01 (M0): 사용빈도 신뢰 신호(카드 노출·큐레이션).
  occurrenceCount: number;
  // PRD-BM-D01 (M1): 공유 스코프 + 헬스. rowToPattern 이 DB 에서 항상 채운다(옵셔널=하위호환).
  visibility?: PatternVisibility;
  health?: number | null;
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

// ─── PRD-BM-D01 (M0): 패턴 마켓플레이스 계측 이벤트 ────────────────────────
export const patternEventTypeEnum = z.enum([
  'session_started',
  'free_input_started',
  'pattern_seeded',
  'first_commit',
]);

export const patternSourceEnum = z.enum(['cache', 'discovered', 'shared']);

// UUID 형식 검증(nil-style 허용). 비-UUID 가 통과해 DB 타입 에러(500)로 새는 것을 막는다.
const uuidString = () =>
  z
    .string()
    .regex(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
      'Invalid UUID',
    );

export const patternEventRequestSchema = z.object({
  sessionId: z.string().min(1).max(128),
  eventType: patternEventTypeEnum,
  patternId: uuidString().nullable().optional(),
  patternSource: patternSourceEnum.nullable().optional(),
  partitionId: uuidString().nullable().optional(),
  // userId 는 받지 않는다 — 클라이언트 제공값은 위조 가능. 필요 시 서버가 세션에서 주입.
  props: z
    .record(z.string(), z.unknown())
    .refine((p) => JSON.stringify(p).length <= 4096, 'props 가 너무 큽니다(4KB 초과)')
    .optional(),
});

export type PatternEventRequestInput = z.infer<typeof patternEventRequestSchema>;

// ─── PRD-BM-D01 (M2): 공유 패턴 발행 ──────────────────────────────────────
export const publishPatternRequestSchema = z.object({
  visibility: z.enum(['org', 'public']),
  // 라이선스 미확인 패턴 발행 승인(게이트). 미확인인데 false 면 서버가 차단.
  acknowledgeLicense: z.boolean().optional().default(false),
});

export type PublishPatternRequestInput = z.input<typeof publishPatternRequestSchema>;

export { patternMethodEnum };
