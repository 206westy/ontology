// H6: 선택적(opt-in) 페이지네이션. limit/offset 을 주지 않으면 전체를 반환해
// 기존 동작(그래프 전체 로드)을 그대로 보존한다 — 기본값에 조용한 절단을 넣지 않는다.
// (그래프는 온톨로지 전체를 클라이언트에 렌더하므로 기본 절단은 데이터 손실이 된다.)
// limit 을 명시한 호출자만 상한을 받는다.
export const MAX_PAGE_LIMIT = 1000;

export interface Pagination {
  limit?: number;
  offset?: number;
}

/** limit/offset 쿼리 파라미터를 파싱한다. 미지정/무효 → undefined(전체 반환). */
export function parsePagination(searchParams: URLSearchParams): Pagination {
  const rawLimit = searchParams.get('limit');
  const rawOffset = searchParams.get('offset');

  const limitNum = rawLimit != null ? Number(rawLimit) : NaN;
  const offsetNum = rawOffset != null ? Number(rawOffset) : NaN;

  const limit =
    Number.isFinite(limitNum) && limitNum > 0
      ? Math.min(Math.floor(limitNum), MAX_PAGE_LIMIT)
      : undefined;
  const offset =
    Number.isFinite(offsetNum) && offsetNum > 0 ? Math.floor(offsetNum) : undefined;

  return { limit, offset };
}
