'use client';

import { Sparkles, Check, SplitSquareHorizontal, Merge, Hand } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { RecognizeResult } from '../../lib/patterns/types';

interface DomainSummaryCardProps {
  recognize: RecognizeResult;
  onConfirm: () => void;
  onSplit?: () => void;
  onMerge?: () => void;
  onManualSelect?: () => void;
}

// PRD-H H8-a: 도메인 요약 카드. "이 내용은 진단으로 보입니다(신뢰 82%)" — 컨펌 게이트.
// 혼합 감지 시 [분할]/[하나로] 를 노출한다. 컨펌 전에는 생성이 시작되지 않는다.
export default function DomainSummaryCard({
  recognize,
  onConfirm,
  onSplit,
  onMerge,
  onManualSelect,
}: DomainSummaryCardProps) {
  const confidencePct = Math.round(recognize.confidence * 100);
  const isMixed = recognize.mixture.length > 1;
  const domainLabel = recognize.domainKo || recognize.domain;

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-2">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="h-4 gap-0.5 px-1 text-[9px]">
          <Sparkles className="h-2.5 w-2.5" />
          도메인 인지
        </Badge>
        <Badge variant="outline" className="ml-auto h-4 px-1 text-[9px]">
          신뢰 {confidencePct}%
        </Badge>
      </div>

      <p className="text-[11px] font-medium">
        이 내용은 <span className="text-primary">{domainLabel}</span>으로 보입니다.
      </p>

      {isMixed && (
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {recognize.mixture
            .map((m) => `${m.domain} ${Math.round(m.ratio * 100)}%`)
            .join(' + ')}
        </p>
      )}

      {recognize.competencyQuestionPreview.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {recognize.competencyQuestionPreview.map((cq, i) => (
            <li key={i} className="text-[10px] text-muted-foreground/80">
              · {cq}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
        {isMixed && onSplit && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-0.5 px-2 text-[10px]"
            onClick={onSplit}
          >
            <SplitSquareHorizontal className="h-3 w-3" />
            분할
          </Button>
        )}
        {isMixed && onMerge && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-0.5 px-2 text-[10px]"
            onClick={onMerge}
          >
            <Merge className="h-3 w-3" />
            하나로
          </Button>
        )}
        {onManualSelect && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-0.5 px-2 text-[10px]"
            onClick={onManualSelect}
          >
            <Hand className="h-3 w-3" />
            직접 선택
          </Button>
        )}
        <Button
          variant="default"
          size="sm"
          className="h-6 gap-0.5 px-2 text-[10px]"
          onClick={onConfirm}
        >
          <Check className="h-3 w-3" />
          이 패턴으로
        </Button>
      </div>
    </div>
  );
}
