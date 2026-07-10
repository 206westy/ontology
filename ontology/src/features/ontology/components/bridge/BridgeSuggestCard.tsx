'use client';

import { Link2, SplitSquareHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmCard } from '@/components/ui/confirm-card';
import type { BridgeSuggestion } from '../../lib/bridge/cross-partition';

interface BridgeSuggestCardProps {
  suggestion: BridgeSuggestion;
  // 구획 id → 표시 이름(없으면 id 축약). 카드가 "[메인트]·[행정] 양쪽" 문구를 만든다.
  partitionNames?: Record<string, string>;
  onConnect: (suggestion: BridgeSuggestion) => void;
  onDistinct: () => void;
  connecting?: boolean;
}

function partitionLabel(
  id: string,
  names?: Record<string, string>,
): string {
  return names?.[id] ?? id.slice(0, 8);
}

// PRD-H H8-f: 브릿지 제안 카드. 같은 대상이 두 구획에 등장할 때 "브릿지로 연결?"을 묻는다.
// 타입·근거를 함께 노출하고(무분별 연결 방지), 확정 시에만 연결한다.
// PRD-I §3: 공통 ConfirmCard 껍데기로 재정규화(판정→근거→미리보기→액션).
export default function BridgeSuggestCard({
  suggestion,
  partitionNames,
  onConnect,
  onDistinct,
  connecting = false,
}: BridgeSuggestCardProps) {
  const {
    sourceName,
    targetName,
    sourcePartition,
    targetPartition,
    relationType,
    evidence,
    score,
  } = suggestion;

  const entity = sourceName === targetName ? sourceName : `${sourceName} ↔ ${targetName}`;
  const srcLabel = partitionLabel(sourcePartition, partitionNames);
  const tgtLabel = partitionLabel(targetPartition, partitionNames);

  return (
    <ConfirmCard
      eyebrow="브릿지 후보"
      verdict="relate"
      attention
      title={
        <>
          {entity}이(가) [{srcLabel}]·[{tgtLabel}] 양쪽에 등장 — 브릿지로 연결?
        </>
      }
      evidence={
        <>
          타입: {relationType} · {Math.round(score * 100)}% 유사
          {evidence && <> · 근거: {evidence}</>}
        </>
      }
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-0.5 px-2 text-xs"
            onClick={onDistinct}
          >
            <SplitSquareHorizontal className="h-3 w-3" />
            별개
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-6 gap-0.5 px-2 text-xs"
            onClick={() => onConnect(suggestion)}
            disabled={connecting}
          >
            <Link2 className="h-3 w-3" />
            연결
          </Button>
        </>
      }
    />
  );
}
