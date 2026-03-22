'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commitsApi } from '../api';
import type { CreateCommitInput } from '../lib/schemas';

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
    onSuccess: () => qc.invalidateQueries({ queryKey: COMMITS_KEY }),
  });
}
