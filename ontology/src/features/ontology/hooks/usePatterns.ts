'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patternsApi, discoverPatternApi } from '../api';
import type {
  DiscoverPatternRequestInput,
  PromotePatternRequestInput,
} from '../lib/patterns/types';

const PATTERNS_KEY = ['patterns'] as const;

export function usePatterns() {
  return useQuery({
    queryKey: [...PATTERNS_KEY],
    queryFn: () => patternsApi.list(),
  });
}

// H2: 입력 → 도메인 인지 + (히트 재사용 / 미스 발견). 컨펌 게이트의 진입.
export function useDiscoverPattern() {
  return useMutation({
    mutationFn: (data: DiscoverPatternRequestInput) =>
      discoverPatternApi.discover(data),
  });
}

// H1: 발견 초안을 캐시에 승격(저장).
export function usePromotePattern() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PromotePatternRequestInput) => patternsApi.promote(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: PATTERNS_KEY }),
  });
}
