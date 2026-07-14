'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Pattern } from '../../ontology/lib/patterns/types';

// PRD-BM-D01 (M2-4): 공유 패턴 발행 뮤테이션. 게이트/마스킹/헬스는 서버가 수행.

export interface PublishArgs {
  id: string;
  visibility: 'org' | 'public';
  acknowledgeLicense: boolean;
}

async function publishPattern({ id, visibility, acknowledgeLicense }: PublishArgs): Promise<Pattern> {
  const res = await fetch(`/api/patterns/${id}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibility, acknowledgeLicense }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? '발행에 실패했습니다.');
  }
  return data as Pattern;
}

export function usePublishPattern() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: publishPattern,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketplace'] });
      qc.invalidateQueries({ queryKey: ['patterns'] });
    },
  });
}
