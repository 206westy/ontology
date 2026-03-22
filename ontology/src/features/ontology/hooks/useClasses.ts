'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { classesApi } from '../api';
import type { CreateClassInput, UpdateClassInput } from '../lib/schemas';

const CLASSES_KEY = ['classes'] as const;

export function useClasses(parentId?: string) {
  return useQuery({
    queryKey: [...CLASSES_KEY, { parentId }],
    queryFn: () => classesApi.list(parentId),
  });
}

export function useClass(id: string | null) {
  return useQuery({
    queryKey: [...CLASSES_KEY, id],
    queryFn: () => classesApi.get(id!),
    enabled: !!id,
  });
}

export function useCreateClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateClassInput) => classesApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLASSES_KEY }),
  });
}

export function useUpdateClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateClassInput }) =>
      classesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLASSES_KEY }),
  });
}

export function useDeleteClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => classesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLASSES_KEY }),
  });
}
