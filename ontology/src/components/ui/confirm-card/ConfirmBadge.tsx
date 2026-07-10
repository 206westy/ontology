'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CONFIDENCE_BAND_LABEL,
  VERDICT_META,
  VERDICT_TONE_CLASS,
  confidenceBand,
  type VerdictKind,
} from './verdict';

interface ConfirmBadgeProps {
  verdict: VerdictKind;
  confidence?: number;
  className?: string;
}

// PRD-I §3: 판정 배지. 색=판정 강도(semantic 토큰), confidence는 정성 밴드로 병기.
export function ConfirmBadge({ verdict, confidence, className }: ConfirmBadgeProps) {
  const meta = VERDICT_META[verdict];
  return (
    <Badge
      variant="outline"
      className={cn('h-5 gap-1 px-1.5 text-xs', VERDICT_TONE_CLASS[meta.tone], className)}
    >
      {meta.label}
      {confidence != null && (
        <span className="opacity-70">
          · {CONFIDENCE_BAND_LABEL[confidenceBand(confidence)]}
        </span>
      )}
    </Badge>
  );
}
