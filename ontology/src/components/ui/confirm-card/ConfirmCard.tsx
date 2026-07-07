'use client';

import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ConfirmBadge } from './ConfirmBadge';
import type { VerdictKind } from './verdict';

interface ConfirmCardProps {
  // 1. AI 판정 — 무엇을 감지/제안했는지
  eyebrow?: ReactNode; // 단계/유형
  verdict?: VerdictKind;
  confidence?: number;
  title: ReactNode;
  attention?: boolean; // "검증 필요" 플래그 (애매할수록 신중히 보게)
  // 2. 근거 — 출처·신뢰도·원문 근거 스팬 (투명성, 항상 노출)
  evidence?: ReactNode;
  // 3. 미리보기 — 이 결정이 캔버스/그래프에 미치는 효과
  preview?: ReactNode;
  // 4. 액션 — 주 액션(권장) + 대안 + 건너뛰기
  actions: ReactNode;
  applied?: boolean;
  className?: string;
}

// PRD-I §3 공통 컨펌 문법. 4단 고정 순서: AI판정 → 근거 → 미리보기 → 액션.
// 전 표면(dedup·거버넌스·도메인·패턴·드리프트·브릿지·용어·Critic·보강)이 이 한 껍데기를 공유해
// 같은 시각 언어로 읽히게 한다. 신규 시각 언어 창작이 아니라 기존 카드 스타일의 정규화.
export function ConfirmCard({
  eyebrow,
  verdict,
  confidence,
  title,
  attention,
  evidence,
  preview,
  actions,
  applied,
  className,
}: ConfirmCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border p-2',
        applied
          ? 'border-primary bg-primary/5'
          : attention
            ? 'border-warning/50 bg-warning/5'
            : 'border-border',
        className,
      )}
    >
      {/* 1. AI 판정 */}
      {(eyebrow != null || verdict != null || attention) && (
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {eyebrow != null && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
              {eyebrow}
            </Badge>
          )}
          {verdict != null && <ConfirmBadge verdict={verdict} confidence={confidence} />}
          {attention && (
            <Badge
              variant="outline"
              className="ml-auto h-5 gap-0.5 px-1.5 text-[11px] border-warning text-warning"
            >
              <ShieldAlert className="h-2.5 w-2.5" />
              검증 필요
            </Badge>
          )}
        </div>
      )}

      <div className="text-xs font-medium">{title}</div>

      {/* 2. 근거 */}
      {evidence != null && (
        <div className="mt-0.5 text-[11px] italic text-muted-foreground/70">{evidence}</div>
      )}

      {/* 3. 미리보기 */}
      {preview != null && <div className="mt-1.5">{preview}</div>}

      {/* 4. 액션 */}
      <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">{actions}</div>
    </div>
  );
}
