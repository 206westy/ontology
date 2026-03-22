'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { edgesApi } from '../api';
import type { CreateEdgeInput } from '../lib/schemas';

const EDGES_KEY = ['edges'] as const;

export function useEdges(nodeId?: string) {
  return useQuery({
    queryKey: [...EDGES_KEY, { nodeId }],
    queryFn: () => edgesApi.list(nodeId),
  });
}

export function useCreateEdge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEdgeInput) => edgesApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: EDGES_KEY }),
  });
}

export function useDeleteEdge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => edgesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: EDGES_KEY }),
  });
}
