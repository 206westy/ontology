'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { propertiesApi } from '../api';
import type { CreatePropertyInput } from '../lib/schemas';

const PROPERTIES_KEY = ['properties'] as const;

export function useProperties(classId?: string) {
  return useQuery({
    queryKey: [...PROPERTIES_KEY, { classId }],
    queryFn: () => propertiesApi.list(classId),
    enabled: !!classId,
  });
}

export function useAllProperties() {
  return useQuery({
    queryKey: [...PROPERTIES_KEY, 'all'],
    queryFn: () => propertiesApi.list(),
  });
}

export function useCreateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePropertyInput) => propertiesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROPERTIES_KEY });
      qc.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}
