'use client';

import { Check, Wrench, PencilLine, PackageSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmCard } from '@/components/ui/confirm-card';
import { hasUnverifiedLicense } from '../../lib/patterns/license';
import type { DiscoverSource } from '../../lib/patterns/discover';

interface PatternDiscoveryCardProps {
  patternName: string;
  method: 'adapted' | 'synthesized';
  source: DiscoverSource | null;
  onUse: () => void;
  onAdjust?: () => void;
  onManual?: () => void;
}

// PRD-H H2/H8: 발견 카드. 출처를 투명하게 노출("저장소에서 {label} 발견 → 적응").
// 라이선스 미확인(null/'unknown')이면 amber "검증 필요" 플래그로 경고한다(발행 전 게이트와 정합).
// PRD-I §3: 공통 ConfirmCard 껍데기로 정규화 — 출처는 근거(evidence) 슬롯에.
export default function PatternDiscoveryCard({
  patternName,
  method,
  source,
  onUse,
  onAdjust,
  onManual,
}: PatternDiscoveryCardProps) {
  const license = source?.license ?? null;
  const unverified = hasUnverifiedLicense({ license });
  const licenseWarning = !!source && unverified;
  const originText = source
    ? `저장소에서 ${source.label} 발견 → 적응`
    : '참고 어휘 없이 새로 합성';

  return (
    <ConfirmCard
      eyebrow={
        <span className="flex items-center gap-0.5">
          <PackageSearch className="h-2.5 w-2.5" />
          {method === 'adapted' ? '적응' : '합성'}
        </span>
      }
      attention={licenseWarning}
      title={patternName}
      evidence={
        <>
          {originText}
          {licenseWarning && ' · 라이선스 미확인'}
          {source?.uri && (
            <span className="mt-0.5 block truncate font-mono text-xs not-italic text-muted-foreground/70">
              {source.uri}
            </span>
          )}
        </>
      }
      actions={
        <>
          {onManual && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-0.5 px-2 text-xs"
              onClick={onManual}
            >
              <PencilLine className="h-3 w-3" />
              직접
            </Button>
          )}
          {onAdjust && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-0.5 px-2 text-xs"
              onClick={onAdjust}
            >
              <Wrench className="h-3 w-3" />
              조정
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            className="h-6 gap-0.5 px-2 text-xs"
            onClick={onUse}
          >
            <Check className="h-3 w-3" />
            이걸로
          </Button>
        </>
      }
    />
  );
}
