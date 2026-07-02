'use client';

import { Check, Wrench, PencilLine, ShieldAlert, PackageSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
// 라이선스 미확인(null/'unknown')이면 amber 배지로 경고한다(발행 전 게이트와 정합).
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
  const originText = source
    ? `저장소에서 ${source.label} 발견 → 적응`
    : '참고 어휘 없이 새로 합성';

  return (
    <div className="rounded-lg border border-border p-2">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="h-4 gap-0.5 px-1 text-[9px]">
          <PackageSearch className="h-2.5 w-2.5" />
          {method === 'adapted' ? '적응' : '합성'}
        </Badge>
        {source && unverified && (
          <Badge
            variant="outline"
            className="ml-auto h-4 gap-0.5 border-amber-400 px-1 text-[9px] text-amber-600"
          >
            <ShieldAlert className="h-2.5 w-2.5" />
            라이선스 미확인
          </Badge>
        )}
      </div>

      <p className="text-[11px] font-medium">{patternName}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{originText}</p>
      {source?.uri && (
        <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground/70">
          {source.uri}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
        {onManual && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-0.5 px-2 text-[10px]"
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
            className="h-6 gap-0.5 px-2 text-[10px]"
            onClick={onAdjust}
          >
            <Wrench className="h-3 w-3" />
            조정
          </Button>
        )}
        <Button
          variant="default"
          size="sm"
          className="h-6 gap-0.5 px-2 text-[10px]"
          onClick={onUse}
        >
          <Check className="h-3 w-3" />
          이걸로
        </Button>
      </div>
    </div>
  );
}
