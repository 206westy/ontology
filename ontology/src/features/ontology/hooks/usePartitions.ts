'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { partitionsApi } from '../api';
import type { CreatePartitionInput } from '../lib/schemas';

const PARTITIONS_KEY = ['partitions'] as const;

export function usePartitions() {
  return useQuery({
    queryKey: [...PARTITIONS_KEY],
    queryFn: () => partitionsApi.list(),
  });
}

export function useCreatePartition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePartitionInput) => partitionsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: PARTITIONS_KEY }),
  });
}
