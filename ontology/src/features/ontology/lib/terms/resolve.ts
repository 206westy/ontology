import {
  buildContextQuery,
  type ContextQueryInput,
} from './context-query';
import type { TermCandidate, TermResolution } from './types';

// PRD-H (H4/M3): 용어 해소 오케스트레이터. deps 를 주입해 네트워크·LLM·DB 없이
// 단위 테스트한다(실제 배선은 라우트). 해소 순서:
//   ① 내부 도메인 용어집 → ② 현재 온톨로지 맥락 → ③ (opt-in) 웹 → ④ 사용자 확인.
// 자동 확정 없음 — 랭킹된 후보만 돌려준다. 도메인-스코프(전역 확정 금지).

// ① 내부 용어집 룩업(도메인-스코프). 히트 없으면 null.
export type GlossaryLookupFn = (
  domain: string,
  term: string,
) => TermCandidate | null;

// ② 현재 온톨로지 맥락 기반 해소(LLM primary). 맥락 주입 입력을 받는다.
export type ContextResolveFn = (
  input: ContextQueryInput,
) => Promise<TermCandidate[]>;

// ③ opt-in 웹 해소. 맥락 주입 질의 + 원본 입력을 받는다(키워드 단독 금지).
export type WebResolveFn = (
  query: string,
  input: ContextQueryInput,
) => Promise<TermCandidate[]>;

export interface ResolveDeps {
  glossaryLookup: GlossaryLookupFn;
  contextResolveFn: ContextResolveFn;
  // 없으면 웹 단계는 항상 생략(opt-in 이자 미배선 안전).
  webResolveFn?: WebResolveFn;
}

export interface ResolveTermsOptions {
  domain: string;
  domainKo?: string | null;
  adjacentNodes: string[];
  candidateType?: string | null;
  // 웹 opt-in 게이트. true + webResolveFn 있을 때만 웹 후보를 붙인다.
  allowWeb: boolean;
}

// 출처 우선순위: 내부 용어집(확정 캐시) > 현재 맥락 > 웹.
const SOURCE_RANK: Record<TermCandidate['source'], number> = {
  internal: 3,
  context: 2,
  web: 1,
};

function rankCandidates(candidates: TermCandidate[]): TermCandidate[] {
  return [...candidates].sort((a, b) => {
    const rank = SOURCE_RANK[b.source] - SOURCE_RANK[a.source];
    if (rank !== 0) return rank;
    return b.confidence - a.confidence;
  });
}

export async function resolveTerm(
  term: string,
  options: ResolveTermsOptions,
  deps: ResolveDeps,
): Promise<TermResolution> {
  const queryInput: ContextQueryInput = {
    term,
    domain: options.domain,
    domainKo: options.domainKo,
    adjacentNodes: options.adjacentNodes,
    candidateType: options.candidateType,
  };
  const contextInjected = buildContextQuery(queryInput);
  const candidates: TermCandidate[] = [];

  // ① 내부 용어집(도메인-스코프). 확정된 뜻이 있으면 최우선 후보.
  const internal = deps.glossaryLookup(options.domain, term);
  if (internal) candidates.push(internal);

  // ② 현재 온톨로지 맥락.
  const contextCandidates = await deps.contextResolveFn(queryInput);
  candidates.push(...contextCandidates);

  // ③ 웹 — opt-in 이며 배선돼 있을 때만.
  if (options.allowWeb && deps.webResolveFn) {
    const webCandidates = await deps.webResolveFn(contextInjected, queryInput);
    candidates.push(...webCandidates);
  }

  return { term, candidates: rankCandidates(candidates), contextInjected };
}

// 배치 해소: 감지된 용어 목록을 병렬로 해소.
export async function resolveTerms(
  terms: string[],
  options: ResolveTermsOptions,
  deps: ResolveDeps,
): Promise<TermResolution[]> {
  return Promise.all(terms.map((t) => resolveTerm(t, options, deps)));
}
