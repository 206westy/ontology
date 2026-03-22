'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { axiomsApi } from '../api';
import type { CreateAxiomInput } from '../lib/schemas';

const AXIOMS_KEY = ['axioms'] as const;

export function useAxioms() {
  return useQuery({
    queryKey: [...AXIOMS_KEY],
    queryFn: () => axiomsApi.list(),
  });
}

export function useCreateAxiom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAxiomInput) => axiomsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: AXIOMS_KEY }),
  });
}
