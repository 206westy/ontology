'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { instancesApi } from '../api';
import type { CreateInstanceInput } from '../lib/schemas';

const INSTANCES_KEY = ['instances'] as const;

export function useInstances(classId?: string) {
  return useQuery({
    queryKey: [...INSTANCES_KEY, { classId }],
    queryFn: () => instancesApi.list(classId),
    enabled: !!classId,
  });
}

export function useAllInstances() {
  return useQuery({
    queryKey: [...INSTANCES_KEY, 'all'],
    queryFn: () => instancesApi.list(),
  });
}

export function useCreateInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInstanceInput) => instancesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INSTANCES_KEY });
      qc.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}
