import type { Pattern } from './types';

// PRD-BM-D01 (M1-2): 마켓플레이스 카탈로그 필터·정렬(순수 함수).
// 라우트가 DB read 후 이 함수로 좁힌다. DB-프리 → 단위테스트 용이.

export interface CatalogQuery {
  domain?: string | null;
  visibility?: string | null; // private|org|public
  source?: string | null; // method: retrieved|adapted|synthesized|bootstrap
  q?: string | null; // 자유 텍스트(name/nameKo/domain)
  sort?: string | null; // occurrence|health|recent
}

export type CatalogSort = 'occurrence' | 'health' | 'recent';

function sortPatterns(rows: Pattern[], sort?: string | null): Pattern[] {
  const copy = [...rows];
  switch (sort) {
    case 'health':
      // 헬스 높은 순(미산정 null 은 하단).
      return copy.sort((a, b) => (b.health ?? -1) - (a.health ?? -1));
    case 'recent':
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'occurrence':
    default:
      // 기본: 사용빈도 높은 순(가장 검증된 시작점 먼저).
      return copy.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  }
}

/** 카탈로그 조회: draft 제외 + 도메인/스코프/출처/텍스트 필터 + 정렬. */
export function filterAndSortPatterns(patterns: Pattern[], query: CatalogQuery): Pattern[] {
  let rows = patterns.filter((p) => !p.isDraft);

  if (query.domain) rows = rows.filter((p) => p.domain === query.domain);
  if (query.visibility) {
    rows = rows.filter((p) => (p.visibility ?? 'private') === query.visibility);
  } else {
    // 보안 기본값: 카탈로그는 공유(org/public)만 노출한다.
    // private 은 미발행·미마스킹이므로 명시적으로 visibility=private 을 요청할 때만 반환한다.
    rows = rows.filter((p) => (p.visibility ?? 'private') !== 'private');
  }
  if (query.source) rows = rows.filter((p) => p.method === query.source);
  if (query.q) {
    const needle = query.q.toLowerCase();
    rows = rows.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.nameKo.toLowerCase().includes(needle) ||
        p.domain.toLowerCase().includes(needle),
    );
  }

  return sortPatterns(rows, query.sort);
}

/** 카탈로그 모드 여부: 카탈로그 전용 파라미터가 하나라도 있으면 true(단독 ?domain= 은 히트). */
export function isCatalogQuery(query: CatalogQuery & { mode?: string | null }): boolean {
  return Boolean(
    query.visibility || query.source || query.q || query.sort || query.mode === 'catalog',
  );
}
