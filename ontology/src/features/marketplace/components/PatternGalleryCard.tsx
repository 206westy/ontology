'use client';

import {
  Boxes,
  Waypoints,
  HelpCircle,
  Gauge,
  Sprout,
  ArrowUpRight,
  ShieldAlert,
  Lock,
  Users,
  Globe,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hasUnverifiedLicense } from '../../ontology/lib/patterns/license';
import type { Pattern, PatternVisibility } from '../../ontology/lib/patterns/types';
import { domainColorVar, healthTone, methodLabel, VISIBILITY_LABEL } from '../lib/visuals';

// PRD-BM-D01 (M1-3): 마켓플레이스 갤러리 카드.
// 신뢰 신호(출처·라이선스·사용빈도·헬스·공유스코프) 100% 표면화 + 스케일 대비 위계 + hover 깊이.
// 디자인 토큰만 사용(하드코딩 팔레트 금지). 전체 카드 클릭 대신 명시적 액션 2개(a11y).

interface PatternGalleryCardProps {
  pattern: Pattern;
  onSeed: (pattern: Pattern) => void;
  onDetails: (pattern: Pattern) => void;
  /** 이 카드가 시딩 중(스피너 라벨). */
  isSeeding?: boolean;
  /** 전역 시딩 진행 중(다중 카드 동시 시딩 방지 — 모든 시작 버튼 비활성화). */
  busy?: boolean;
  /** M2-5 큐레이션: 임계 이하면 흐리게. */
  dimmed?: boolean;
}

const VISIBILITY_ICON: Record<PatternVisibility, typeof Lock> = {
  private: Lock,
  org: Users,
  public: Globe,
};

export function PatternGalleryCard({
  pattern,
  onSeed,
  onDetails,
  isSeeding,
  busy,
  dimmed,
}: PatternGalleryCardProps) {
  const displayName = pattern.nameKo?.trim() ? pattern.nameKo : pattern.name;
  const unverified = hasUnverifiedLicense(pattern);
  const visibility = pattern.visibility ?? 'private';
  const VisIcon = VISIBILITY_ICON[visibility];
  const accent = domainColorVar(pattern.domain);
  const seedable = pattern.roles.length > 0;

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-elevation-1 transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-elevation-2',
        dimmed && 'opacity-60 saturate-50',
      )}
    >
      {/* 도메인 색 상단 액센트(레이어링) */}
      <span aria-hidden className="h-1 w-full" style={{ backgroundColor: accent }} />

      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* 헤더: 도메인 + 공유 스코프 */}
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
            {pattern.domain}
          </span>
          <Badge variant="outline" className="h-5 shrink-0 gap-1 px-1.5 text-xs">
            <VisIcon className="h-2.5 w-2.5" />
            {VISIBILITY_LABEL[visibility]}
          </Badge>
        </div>

        {/* 제목(스케일 대비 위계) */}
        <h3 className="text-base font-semibold leading-snug tracking-tight text-foreground">
          {displayName}
        </h3>

        {/* 구조 통계 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Boxes className="h-3 w-3" />역할 {pattern.roles.length}
          </span>
          <span className="flex items-center gap-1">
            <Waypoints className="h-3 w-3" />관계 {pattern.relationTypes.length}
          </span>
          <span className="flex items-center gap-1">
            <HelpCircle className="h-3 w-3" />CQ {pattern.competencyQuestions.length}
          </span>
        </div>

        {/* 신뢰 신호: 사용빈도 · 헬스 · 출처 · 라이선스 */}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-xs tabular-nums">
            사용 {pattern.occurrenceCount}
          </Badge>
          {pattern.health != null && (
            <Badge
              variant="outline"
              className={cn('h-5 gap-1 px-1.5 text-xs tabular-nums', healthTone(pattern.health))}
            >
              <Gauge className="h-2.5 w-2.5" />
              {Math.round(pattern.health)}
            </Badge>
          )}
          <Badge variant="outline" className="h-5 px-1.5 text-xs text-muted-foreground">
            {methodLabel(pattern.method)}
          </Badge>
          {unverified ? (
            <Badge variant="outline" className="h-5 gap-1 border-warning px-1.5 text-xs text-warning">
              <ShieldAlert className="h-2.5 w-2.5" />
              라이선스 미확인
            </Badge>
          ) : (
            pattern.license && (
              <Badge variant="outline" className="h-5 px-1.5 text-xs text-muted-foreground">
                {pattern.license}
              </Badge>
            )
          )}
        </div>
      </div>

      {/* 액션 */}
      <div className="flex items-center gap-1.5 border-t border-border px-4 py-2.5">
        <Button
          size="sm"
          className="h-7 flex-1 gap-1 text-xs"
          disabled={busy || !seedable}
          onClick={() => onSeed(pattern)}
        >
          <Sprout className="h-3.5 w-3.5" />
          {isSeeding ? '시딩 중…' : '이 패턴으로 시작'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-0.5 px-2 text-xs text-muted-foreground"
          onClick={() => onDetails(pattern)}
          aria-label={`${displayName} 자세히 보기`}
        >
          자세히
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </article>
  );
}
