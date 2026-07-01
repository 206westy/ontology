'use client';

import { useQuery } from '@tanstack/react-query';
import { instanceValuesApi } from '../api';
import type { InstanceValue } from '../lib/types';

const INSTANCE_VALUES_KEY = ['instance-values'] as const;

export function useInstanceValues() {
  return useQuery({
    queryKey: [...INSTANCE_VALUES_KEY],
    queryFn: () => instanceValuesApi.list() as Promise<InstanceValue[]>,
  });
}
