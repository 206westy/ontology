import type { OntologySource, RetrievedSeed } from './provider';

// PRD-H (D5): LOV(Linked Open Vocabularies) 무키 REST 소스.
// 검색 엔드포인트: /api/v2/vocabulary/search?q={query} → JSON.
// 실패(네트워크·비200·파싱)는 모두 빈 결과로 흡수한다(발견은 best-effort).
const LOV_VOCAB_SEARCH =
  'https://lov.linkeddata.es/dataset/lov/api/v2/vocabulary/search';

// 상위 N 개만 채택(비용/노이즈 상한).
const MAX_SEEDS = 5;

interface LovVocabHit {
  prefix?: string;
  uri?: string;
  'titles'?: { value?: string; lang?: string }[];
  'descriptions'?: { value?: string; lang?: string }[];
  tags?: string[];
  // LOV 검색 랭킹 점수(있으면 사용, 없으면 순위 기반 폴백).
  score?: number;
}

interface LovSearchResponse {
  results?: LovVocabHit[];
}

function firstText(items?: { value?: string }[]): string {
  return items?.find((i) => i.value)?.value ?? '';
}

function hitToSeed(hit: LovVocabHit, rank: number): RetrievedSeed {
  const title = firstText(hit.titles) || hit.prefix || 'vocabulary';
  const description = firstText(hit.descriptions);
  const tags = hit.tags?.length ? ` [${hit.tags.join(', ')}]` : '';
  return {
    label: hit.prefix ? `${hit.prefix} — ${title}` : title,
    repo: 'LOV',
    uri: hit.uri ?? null,
    // LOV 검색 응답은 어휘 라이선스를 포함하지 않는다 → null(발행 전 경고 대상).
    license: null,
    // 점수가 있으면 정규화(0..1 가정), 없으면 순위 폴백.
    score: typeof hit.score === 'number' ? hit.score : 1 - rank * 0.1,
    summary: `${title}${tags}${description ? `: ${description}` : ''}`.trim(),
  };
}

export function createLovSource(
  fetchImpl: typeof fetch = fetch,
): OntologySource {
  return {
    name: 'LOV',
    async search(query: string): Promise<RetrievedSeed[]> {
      try {
        const url = `${LOV_VOCAB_SEARCH}?q=${encodeURIComponent(query)}`;
        const res = await fetchImpl(url);
        if (!res.ok) return [];
        const json = (await res.json()) as LovSearchResponse;
        const hits = json.results ?? [];
        return hits.slice(0, MAX_SEEDS).map((hit, i) => hitToSeed(hit, i));
      } catch {
        // 네트워크·파싱 실패 = 발견 실패 → synthesize 로 폴백.
        return [];
      }
    },
  };
}

export const lovSource = createLovSource();
