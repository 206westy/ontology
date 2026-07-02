'use client';

import { useMutation } from '@tanstack/react-query';
import { driftApi } from '../api';
import type { DriftRequestInput } from '../lib/patterns/drift';

// PRD-H (H5/M4): 스키마 드리프트 판정 훅. 패턴 밖 신규 요소를 매핑/확장/분기로 판정한다.
// 판정만 — 확장 승격/분기 발견/브릿지 생성은 각각 컨펌 후 별도 훅으로 수행.
export function useJudgeDrift() {
  return useMutation({
    mutationFn: (data: DriftRequestInput) => driftApi.judge(data),
  });
}
