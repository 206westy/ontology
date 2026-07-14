'use client';

import { Boxes, Sprout, Check } from 'lucide-react';
import { ConfirmCard } from '@/components/ui/confirm-card';
import { Button } from '@/components/ui/button';
import { hasUnverifiedLicense } from '../../lib/patterns/license';
import { buildSeedPreview } from '../../lib/patterns/seed';
import type { Pattern } from '../../lib/patterns/types';

// PRD-BM-D01 (M0-4): 로컬 캐시 패턴 시드 카드.
// ConfirmCard 4단 문법 준수. 출처·라이선스·사용빈도(신뢰 3신호) 100% 표면화 +
// "새 구획으로 시딩" 프리뷰(생성될 클래스/관계 수). 반영은 항상 HITL(컨펌 클릭).

interface PatternSeedCardProps {
  pattern: Pattern;
  onSeed: (pattern: Pattern) => void;
  isSeeding?: boolean;
  /** 전역 시딩 진행 중(다중 카드 동시 시딩 방지). */
  busy?: boolean;
  applied?: boolean;
}

export function PatternSeedCard({ pattern, onSeed, isSeeding, busy, applied }: PatternSeedCardProps) {
  const preview = buildSeedPreview(pattern);
  const unverified = hasUnverifiedLicense(pattern);
  const sourceLabel = pattern.sourceLabel ?? pattern.sourceRepo ?? '내부 캐시';
  const displayName = pattern.nameKo?.trim() ? pattern.nameKo : pattern.name;
  const licenseText = unverified ? '라이선스 미확인' : pattern.license;

  // 출처·사용빈도·라이선스 — 신뢰 신호(항상 노출).
  const evidence = (
    <>
      출처 {sourceLabel} · 사용 {pattern.occurrenceCount}회
      {licenseText ? ` · ${licenseText}` : ''}
      {pattern.sourceUri && (
        <span className="mt-0.5 block truncate font-mono text-xs not-italic text-muted-foreground/70">
          {pattern.sourceUri}
        </span>
      )}
    </>
  );

  const seedPreview = (
    <div className="rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
      새 구획에 <span className="font-medium text-foreground">클래스 {preview.classCount}개</span>
      {' · '}
      <span className="font-medium text-foreground">관계 {preview.relationCount}개</span> 생성
      {preview.skippedRelations.length > 0 && (
        <span className="mt-0.5 block text-muted-foreground/70">
          관계 {preview.skippedRelations.length}개는 역할 누락으로 제외됩니다.
        </span>
      )}
    </div>
  );

  return (
    <ConfirmCard
      eyebrow={
        <span className="flex items-center gap-0.5">
          <Boxes className="h-2.5 w-2.5" />
          {pattern.domain}
        </span>
      }
      attention={unverified}
      title={displayName}
      evidence={evidence}
      preview={seedPreview}
      applied={applied}
      actions={
        <Button
          variant="default"
          size="sm"
          className="h-6 gap-0.5 px-2 text-xs"
          disabled={busy || applied || preview.classCount === 0}
          onClick={() => onSeed(pattern)}
        >
          {applied ? <Check className="h-3 w-3" /> : <Sprout className="h-3 w-3" />}
          {applied ? '시딩됨' : isSeeding ? '시딩 중…' : '새 구획으로 시딩'}
        </Button>
      }
    />
  );
}
