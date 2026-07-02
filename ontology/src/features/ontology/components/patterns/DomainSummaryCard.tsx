'use client';

import { Sparkles, Check, SplitSquareHorizontal, Merge, Hand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmCard } from '@/components/ui/confirm-card';
import type { RecognizeResult } from '../../lib/patterns/types';

interface DomainSummaryCardProps {
  recognize: RecognizeResult;
  onConfirm: () => void;
  onSplit?: () => void;
  onMerge?: () => void;
  onManualSelect?: () => void;
}

// PRD-H H8-a: 도메인 요약 카드. "이 내용은 진단으로 보입니다" — 컨펌 게이트.
// 혼합 감지 시 [분할]/[하나로] 를 노출한다. 컨펌 전에는 생성이 시작되지 않는다.
// PRD-I §3: 공통 ConfirmCard 껍데기로 정규화.
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
  const hasPreview = isMixed || recognize.competencyQuestionPreview.length > 0;

  return (
    <ConfirmCard
      eyebrow={
        <span className="flex items-center gap-0.5">
          <Sparkles className="h-2.5 w-2.5" />
          도메인 인지
        </span>
      }
      title={
        <>
          이 내용은 <span className="text-primary">{domainLabel}</span>으로 보입니다.
        </>
      }
      evidence={`신뢰 ${confidencePct}%`}
      preview={
        hasPreview ? (
          <>
            {isMixed && (
              <p className="font-mono text-[10px] text-muted-foreground">
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
          </>
        ) : undefined
      }
      actions={
        <>
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
        </>
      }
    />
  );
}
