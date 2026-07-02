'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bridgesApi } from '../api';
import type { CreateBridgeInput } from '../lib/bridge/cross-partition';

// PRD-H (H6/M4): 크로스-구획 브릿지 훅. 후보 조회 + 컨펌 생성.
const BRIDGES_KEY = ['bridges'] as const;

// 서로 다른 구획의 동일 대상 후보(자동 생성 없음).
export function useBridgeCandidates(enabled = true) {
  return useQuery({
    queryKey: [...BRIDGES_KEY],
    queryFn: () => bridgesApi.candidates(),
    enabled,
  });
}

// 컨펌 시 브릿지 엣지 생성(is_bridge=true, 타입·근거 기록) → 후보 무효화.
export function useCreateBridge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBridgeInput) => bridgesApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: BRIDGES_KEY }),
  });
}
