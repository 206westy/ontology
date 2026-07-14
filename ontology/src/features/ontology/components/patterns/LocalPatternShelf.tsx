'use client';

import { Boxes } from 'lucide-react';
import { usePatterns } from '../../hooks/usePatterns';
import { usePatternSeed } from '../../hooks/usePatternSeed';
import { PatternSeedCard } from './PatternSeedCard';
import type { Pattern } from '../../lib/patterns/types';

// PRD-BM-D01 (M0-5): EmptyState 에 노출되는 로컬 캐시 패턴 선반.
// usePatterns() 의 첫 소비자 — 저장된(비-draft·역할 보유) 패턴을 사용빈도 순으로 카드화한다.
// 전체 카탈로그(공유·필터)는 M1 마켓플레이스 페이지. 여기선 상위 N 개만 "시작점"으로 노출.

const MAX_SHELF = 6;

interface LocalPatternShelfProps {
  className?: string;
}

export function LocalPatternShelf({ className }: LocalPatternShelfProps) {
  const { data, isLoading } = usePatterns();
  const seed = usePatternSeed();

  // 비-draft + 역할 보유(시딩 가능) 만, 사용빈도 내림차순 상위 N.
  const usable: Pattern[] = (data ?? [])
    .filter((p) => !p.isDraft && p.roles.length > 0)
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
    .slice(0, MAX_SHELF);

  // 로딩 중이거나 캐시가 비면 선반을 숨긴다(EmptyState 의 다른 진입점이 있으므로 조용히).
  if (isLoading || usable.length === 0) return null;

  const seedingId = seed.isPending ? seed.variables?.pattern.id : undefined;
  const seededId = seed.isSuccess ? seed.variables?.pattern.id : undefined;

  return (
    <section className={className} aria-label="저장된 패턴으로 시작">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Boxes className="h-3.5 w-3.5" />
        저장된 패턴으로 시작
      </div>
      <div className="space-y-2">
        {usable.map((pattern) => (
          <PatternSeedCard
            key={pattern.id}
            pattern={pattern}
            onSeed={(p) => seed.mutate({ pattern: p, source: 'cache' })}
            isSeeding={seedingId === pattern.id}
            busy={seed.isPending}
            applied={seededId === pattern.id}
          />
        ))}
      </div>
    </section>
  );
}
