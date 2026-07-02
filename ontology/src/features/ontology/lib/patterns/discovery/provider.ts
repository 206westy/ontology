import type { PatternBundle } from '../types';

// PRD-H (H2/M1): 발견 파이프라인의 소스 추상화.
// 온톨로지 저장소(LOV 우선, BioPortal/ODP 후속)를 provider 인터페이스 뒤에 둔다.

// 소스가 돌려주는 씨앗(seed): 채택할 저장소 항목의 출처·라이선스 메타 + 적응용 요약.
export interface RetrievedSeed {
  // 사람이 읽는 라벨(예: 어휘 prefix/제목). PatternDiscoveryCard 출처 노출에 쓰임.
  label: string;
  // 저장소명(예: 'LOV'). patterns.source_repo 로 저장.
  repo: string | null;
  // 항목 URI. patterns.source_uri 로 저장.
  uri: string | null;
  // 라이선스(없으면 null → 발행 전 경고). LOV 검색 응답엔 대개 없음(문서화된 가정).
  license: string | null;
  // 랭킹 점수(내림차순 정렬). 소스별 스코어를 정규화.
  score: number;
  // adapt LLM 에 주입할 항목 요약(제목·설명·태그 등).
  summary: string;
}

export interface DiscoverContext {
  domain: string;
  domainKo: string;
  text: string;
  competencyQuestions: string[];
}

export interface OntologySource {
  readonly name: string;
  search(query: string, domainHint: string): Promise<RetrievedSeed[]>;
}

// adapt/synthesize 는 DI 로 주입해 discover() 를 네트워크·LLM 없이 단위 테스트한다.
export type AdaptFn = (
  seed: RetrievedSeed,
  ctx: DiscoverContext,
) => Promise<PatternBundle>;

export type SynthesizeFn = (ctx: DiscoverContext) => Promise<PatternBundle>;
