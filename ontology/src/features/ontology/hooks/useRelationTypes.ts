'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { relationTypesApi } from '../api';
import type { CreateRelationTypeInput } from '../lib/schemas';

const RELATION_TYPES_KEY = ['relationTypes'] as const;

export function useRelationTypes() {
  return useQuery({
    queryKey: [...RELATION_TYPES_KEY],
    queryFn: () => relationTypesApi.list(),
  });
}

export function useCreateRelationType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRelationTypeInput) =>
      relationTypesApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: RELATION_TYPES_KEY }),
  });
}
