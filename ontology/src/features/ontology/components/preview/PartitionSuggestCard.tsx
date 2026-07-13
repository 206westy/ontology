'use client';

import { Layers, SplitSquareHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmCard } from '@/components/ui/confirm-card';
import BridgeSuggestCard from '../bridge/BridgeSuggestCard';
import type { BridgeSuggestion } from '../../lib/bridge/cross-partition';
import type { PartitionDecision } from '../../lib/partition/suggest';

interface PartitionSuggestCardProps {
  decision: PartitionDecision;
  suggestedPartitionName?: string | null;
  rationale?: string | null;
  bridges?: BridgeSuggestion[];
  // 구획 id → 표시 이름(bridge 카드 라벨용).
  partitionNames?: Record<string, string>;
  onSeparate: () => void;
  onKeepCurrent: () => void;
  onConnectBridge?: (bridge: BridgeSuggestion) => void;
  onDistinctBridge?: (bridge: BridgeSuggestion) => void;
  busy?: boolean;
  applied?: boolean;
}

// PRD-N M1: AI 자동 구획 제안 밴드(파싱 프리뷰 상단). attach 는 무소음(렌더 X).
// new = 새 구획 분리 제안, bridge = 새 구획 + 교차 개념 bridge. 전부 HITL, 공통 ConfirmCard 문법.
export default function PartitionSuggestCard({
  decision,
  suggestedPartitionName,
  rationale,
  bridges,
  partitionNames,
  onSeparate,
  onKeepCurrent,
  onConnectBridge,
  onDistinctBridge,
  busy = false,
  applied = false,
}: PartitionSuggestCardProps) {
  // 연결성 충분 → 무소음 attach. 제안 카드 없음(수용 기준).
  if (decision === 'attach') return null;

  const name = suggestedPartitionName?.trim() || '새 구획';

  const title =
    decision === 'bridge' ? (
      <>
        일부 개념만 기존 구획과 겹칩니다 — 나머지는 새 구획 ‘{name}’(으)로 분리하고 교차 개념은
        bridge로 이을까요?
      </>
    ) : (
      <>이 입력은 다른 도메인으로 보입니다 — 새 구획 ‘{name}’(으)로 분리할까요?</>
    );

  return (
    <div className="space-y-1.5" data-testid="partition-suggest">
      <ConfirmCard
        eyebrow="구획 제안"
        verdict="fork"
        attention
        applied={applied}
        title={title}
        evidence={rationale ?? undefined}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-0.5 px-2 text-xs"
              onClick={onKeepCurrent}
              disabled={busy}
            >
              <Layers className="h-3 w-3" />
              현재 구획 유지
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-6 gap-0.5 px-2 text-xs"
              onClick={onSeparate}
              disabled={busy}
            >
              <SplitSquareHorizontal className="h-3 w-3" />
              새 구획으로 분리
            </Button>
          </>
        }
      />

      {decision === 'bridge' &&
        (bridges ?? []).map((b) => (
          <BridgeSuggestCard
            key={`${b.sourceId}|${b.targetId}`}
            suggestion={b}
            partitionNames={partitionNames}
            onConnect={() => onConnectBridge?.(b)}
            onDistinct={() => onDistinctBridge?.(b)}
            connecting={busy}
          />
        ))}
    </div>
  );
}
