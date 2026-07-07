'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { constraintsApi } from '../api';
import type { OntologyConstraint } from '../lib/types';

// PRD-L M1: 단일 "규칙" 모델 — constraints 테이블이 정본.
// kind='enforced'(타입 규칙, 검증 대상) / kind='memo'(설명 메모, 비강제).
// 쿼리키는 constraints 로 통일해 어디서 생성/삭제해도 invalidate 가 일관되게 전파된다.
export const RULES_KEY = ['constraints'] as const;

export function useRules() {
  return useQuery({
    queryKey: [...RULES_KEY],
    queryFn: () => constraintsApi.list() as Promise<OntologyConstraint[]>,
  });
}

// 설명 메모 규칙 생성 — constraintType 없이 description 만 기록한다(비강제).
export function useCreateMemoRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { description: string; sourceClassId?: string | null }) =>
      constraintsApi.create({
        kind: 'memo',
        constraintType: null,
        description: data.description,
        sourceClassId: data.sourceClassId ?? null,
        targetClassId: null,
        relationTypeId: null,
        propertyId: null,
        config: {},
        severity: 'info',
        isActive: true,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => constraintsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY }),
  });
}
