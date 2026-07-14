'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMarketplace } from '../hooks/useMarketplace';
import { usePatternSeed } from '../../ontology/hooks/usePatternSeed';
import { curatePatterns, dimmedIdSet } from '../../ontology/lib/patterns/curation';
import type { PatternCatalogQuery } from '../../ontology/api';
import type { Pattern } from '../../ontology/lib/patterns/types';
import { MarketplaceFilters } from './MarketplaceFilters';
import { MarketplaceGrid } from './MarketplaceGrid';
import { PatternDetailSheet } from './PatternDetailSheet';

// PRD-BM-D01 (M1-3): 마켓플레이스 셸 — 전용 페이지의 상단 바 + 에디토리얼 히어로 + 카탈로그.
// 상태(필터/상세 선택)를 소유하고 useMarketplace/usePatternSeed 를 오케스트레이션한다.

export function MarketplaceShell() {
  const [query, setQuery] = useState<PatternCatalogQuery>({ sort: 'occurrence' });
  const [detail, setDetail] = useState<Pattern | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // 빠른 타이핑 중 fetch 폭주를 완화(입력은 즉시 반영, 조회는 지연값 기준).
  const deferredQuery = useDeferredValue(query);
  const { data, isLoading, isError } = useMarketplace(deferredQuery);
  // 시딩 성공 시 스튜디오('/')로 이동 — persist 된 구획 선택을 그대로 연다.
  const seed = usePatternSeed({ redirectTo: '/' });

  // 큐레이션: 임계 이하는 dim + 하단으로(정렬은 서버, dim 은 클라이언트).
  const { patterns, dimmedIds } = useMemo(() => {
    const curated = curatePatterns(data ?? []);
    return {
      patterns: curated.map((c) => c.pattern),
      dimmedIds: dimmedIdSet(curated),
    };
  }, [data]);
  const seedingId = seed.isPending ? seed.variables?.pattern.id : undefined;

  const handleSeed = (pattern: Pattern) => seed.mutate({ pattern, source: 'shared' });
  const handleDetails = (pattern: Pattern) => {
    setDetail(pattern);
    setDetailOpen(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 상단 바(전역 네비 부재 → 자체 구성) */}
      <header className="sticky top-0 z-10 border-b border-border/80 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-6">
          <Button asChild variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs text-muted-foreground">
            <Link href="/">
              <ArrowLeft className="h-3.5 w-3.5" />
              스튜디오
            </Link>
          </Button>
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <Boxes className="h-4 w-4 text-primary" />
            패턴 마켓플레이스
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20">
        {/* 에디토리얼 히어로(스케일 대비 위계 + 브랜드 그라디언트 액센트) */}
        <section className="py-12 sm:py-16">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Ontology Studio · Pattern Marketplace
          </p>
          <h1 className="max-w-2xl text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl">
            빈 캔버스 대신,
            <br />
            <span className="gradient-brand-text">검증된 시작점</span>으로 연다.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
            도메인 전문가들이 수렴시킨 패턴을 골라 한 번의 컨펌으로 새 구획에 시딩하세요. 출처·라이선스·사용
            빈도·헬스가 모든 카드에 그대로 드러나, 신뢰할 수 있는 패턴만 재사용합니다.
          </p>
        </section>

        {/* 필터 + 그리드 */}
        <section aria-labelledby="catalog-heading" className="space-y-5">
          <h2 id="catalog-heading" className="sr-only">
            패턴 카탈로그
          </h2>
          <MarketplaceFilters query={query} onChange={setQuery} total={patterns.length} />
          <MarketplaceGrid
            patterns={patterns}
            isLoading={isLoading}
            isError={isError}
            seedingId={seedingId}
            busy={seed.isPending}
            dimmedIds={dimmedIds}
            onSeed={handleSeed}
            onDetails={handleDetails}
          />
        </section>
      </main>

      <PatternDetailSheet
        pattern={detail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSeed={handleSeed}
        isSeeding={seedingId != null && seedingId === detail?.id}
        busy={seed.isPending}
      />
    </div>
  );
}
