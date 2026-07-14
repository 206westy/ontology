'use client';

import { useQuery } from '@tanstack/react-query';
import { patternsApi, type PatternCatalogQuery } from '../../ontology/api';
import type { Pattern } from '../../ontology/lib/patterns/types';

// PRD-BM-D01 (M1-3): 마켓플레이스 카탈로그 조회(필터/정렬). TanStack Query 캐시.
// placeholderData: 필터 변경 중에도 직전 결과를 유지해 그리드가 스켈레톤으로 깜빡이지 않게 한다.
export function useMarketplace(query: PatternCatalogQuery) {
  return useQuery<Pattern[]>({
    queryKey: ['marketplace', query],
    queryFn: () => patternsApi.catalog(query),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}
