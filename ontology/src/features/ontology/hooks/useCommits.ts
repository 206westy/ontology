'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commitsApi } from '../api';
import type { CreateCommitInput } from '../lib/schemas';
import { logPatternEventOnce } from '../lib/patterns/events';

const COMMITS_KEY = ['commits'] as const;

export function useCommits() {
  return useQuery({
    queryKey: [...COMMITS_KEY],
    queryFn: () => commitsApi.list(),
  });
}

export function useCreateCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCommitInput) => commitsApi.create(data),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: COMMITS_KEY });
      // PRD-BM-D01 (M0-8): 세션 첫 사용자 커밋 = TTFG 종료 앵커(자동저장 제외).
      if (!variables.isAutoSave) {
        logPatternEventOnce({ eventType: 'first_commit' });
      }
    },
  });
}
