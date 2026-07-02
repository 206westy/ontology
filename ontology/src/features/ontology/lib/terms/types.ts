import { z } from 'zod';

// PRD-H (H4/M3): 맥락 주입형 용어 해소의 타입.
// 미정의·모호 용어(약어·은어, 예 `VV`)를 도메인 + 현재 온톨로지 맥락으로 좁혀
// 후보(랭킹+출처+신뢰도)로 제시한다. 자동 확정 없음(HITL) — 확정은 사용자 몫.

// 뜻의 근거 출처. internal=용어집 캐시, context=현재 온톨로지 맥락, web=opt-in 웹.
// (user=사용자 직접 입력은 확정 저장 단계의 source 로만 쓰이고 후보에는 없다.)
export const termCandidateSourceEnum = z.enum(['internal', 'context', 'web']);
export type TermCandidateSource = z.infer<typeof termCandidateSourceEnum>;

// strict 모드(OpenAI structured output): 모든 필드 required + nullable(optional 금지).
export const termCandidateSchema = z.object({
  term: z.string().min(1),
  meaning: z.string().min(1),
  confidence: z.number().min(0).max(1),
  source: termCandidateSourceEnum,
  // 왜 이 뜻인지(주입한 맥락 근거). 근거 없으면 빈 문자열.
  rationale: z.string(),
});

export type TermCandidate = z.infer<typeof termCandidateSchema>;

// LLM(primary) 이 내놓는 후보 묶음.
export const termResolveLlmResponseSchema = z.object({
  candidates: z.array(termCandidateSchema),
});

export type TermResolveLlmResponse = z.infer<typeof termResolveLlmResponseSchema>;

// ─── API request schema ─────────────────────────────────────────────────
export const resolveTermsRequestSchema = z.object({
  terms: z.array(z.string().min(1)).min(1),
  domain: z.string().min(1),
  // 한국어 도메인명(맥락 질의 가독성용, 선택).
  domainKo: z.string().nullable().optional(),
  // 현재 온톨로지 맥락: 형제/인접 노드 이름(키워드 단독 검색 방지).
  contextNodes: z.array(z.string()),
  // 후보 타입(부품/파라미터/신호 등). 있으면 질의에 함께 주입.
  candidateType: z.string().nullable().optional(),
  // 웹 검색 opt-in. 기본 off — 켜야만 웹 후보를 붙인다.
  allowWeb: z.boolean(),
  // 구획 스코프(선택). 확정 저장 시 함께 기록.
  partitionId: z
    .string()
    .regex(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    )
    .nullable()
    .optional(),
});

export type ResolveTermsRequestInput = z.infer<typeof resolveTermsRequestSchema>;

// 한 용어의 해소 결과: 랭킹된 후보 + 투명하게 보여줄 주입 맥락(질의).
export interface TermResolution {
  term: string;
  candidates: TermCandidate[];
  // 이 후보를 고르려고 실제로 주입한 맥락(질의). H8-e 카드가 투명하게 노출.
  contextInjected: string;
}

// ─── 용어집 캐시 저장(확정) schema ─────────────────────────────────────
export const glossarySourceEnum = z.enum(['internal', 'context', 'web', 'user']);
export type GlossarySource = z.infer<typeof glossarySourceEnum>;

// 확정된 뜻을 용어집 캐시에 등록(upsert). 도메인-스코프.
export const confirmTermRequestSchema = z.object({
  domain: z.string().min(1),
  term: z.string().min(1),
  meaning: z.string().min(1),
  source: glossarySourceEnum.default('user'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  evidence: z.string().nullable().optional(),
  partitionId: z
    .string()
    .regex(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    )
    .nullable()
    .optional(),
});

export type ConfirmTermRequestInput = z.infer<typeof confirmTermRequestSchema>;

// 용어집 캐시 항목(도메인-스코프). 재주입·룩업의 소스.
export interface TermGlossaryEntry {
  id: string;
  domain: string;
  partitionId: string | null;
  term: string;
  meaning: string;
  source: GlossarySource;
  confidence: number | null;
  evidence: string | null;
  createdAt: string;
}
