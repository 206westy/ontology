'use client';

import { PackageOpen, TriangleAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PatternGalleryCard } from './PatternGalleryCard';
import type { Pattern } from '../../ontology/lib/patterns/types';

// PRD-BM-D01 (M1-3): 카탈로그 그리드 + 로딩/빈/오류 상태.

interface MarketplaceGridProps {
  patterns: Pattern[];
  isLoading: boolean;
  isError: boolean;
  seedingId?: string;
  /** 전역 시딩 진행 중(다중 카드 동시 시딩 방지). */
  busy?: boolean;
  /** M2-5 큐레이션: 임계 이하로 흐리게 표시할 패턴 id 집합. */
  dimmedIds?: Set<string>;
  onSeed: (pattern: Pattern) => void;
  onDetails: (pattern: Pattern) => void;
}

const GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

export function MarketplaceGrid({
  patterns,
  isLoading,
  isError,
  seedingId,
  busy,
  dimmedIds,
  onSeed,
  onDetails,
}: MarketplaceGridProps) {
  if (isLoading) {
    return (
      <div className={GRID} role="status" aria-busy="true" aria-label="패턴을 불러오는 중">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-52 rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center"
      >
        <TriangleAlert className="h-6 w-6 text-destructive" />
        <p className="text-sm text-muted-foreground">패턴을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
      </div>
    );
  }

  if (patterns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
        <PackageOpen className="h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">조건에 맞는 패턴이 없습니다</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          필터를 넓히거나, 스튜디오에서 도메인을 수렴시킨 뒤 공유 패턴으로 발행해 카탈로그를 채워 보세요.
        </p>
      </div>
    );
  }

  return (
    <div className={GRID}>
      {patterns.map((pattern) => (
        <PatternGalleryCard
          key={pattern.id}
          pattern={pattern}
          isSeeding={seedingId === pattern.id}
          busy={busy}
          dimmed={dimmedIds?.has(pattern.id)}
          onSeed={onSeed}
          onDetails={onDetails}
        />
      ))}
    </div>
  );
}
