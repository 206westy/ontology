'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { termsApi } from '../api';
import type {
  ResolveTermsRequestInput,
  ConfirmTermRequestInput,
} from '../lib/terms/types';

// PRD-H (H4/M3): 용어 해소·용어집 캐시 훅.
const GLOSSARY_KEY = ['term-glossary'] as const;

// 도메인-스코프 용어집 조회(재주입 소스).
export function useTermGlossary(domain: string | null) {
  return useQuery({
    queryKey: [...GLOSSARY_KEY, domain],
    queryFn: () => termsApi.glossary(domain ?? ''),
    enabled: !!domain,
  });
}

// 배치 해소(랭킹 후보). 자동 확정 없음.
export function useResolveTerms() {
  return useMutation({
    mutationFn: (data: ResolveTermsRequestInput) => termsApi.resolve(data),
  });
}

// 확정(upsert) → 용어집 무효화(재주입 반영).
export function useConfirmTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ConfirmTermRequestInput) => termsApi.confirm(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: GLOSSARY_KEY }),
  });
}
