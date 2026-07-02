'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import TermConfirmCard from '../terms/TermConfirmCard';
import DriftDecisionCard from './DriftDecisionCard';
import BridgeSuggestCard from '../bridge/BridgeSuggestCard';
import type { TermCandidate, TermResolution } from '../../lib/terms/types';
import type { Pattern } from '../../lib/patterns/types';
import type { DriftElement, DriftJudgment } from '../../lib/patterns/drift';
import type { ExtendedPatternDraft } from '../../lib/patterns/extend';
import type { BridgeSuggestion } from '../../lib/bridge/cross-partition';

// PRD-H (H8/M5): 패턴-시드 생성 후 HITL 검수 시퀀스(순수 step-runner).
// buildHitlPlan 이 정한 스텝(용어 → 드리프트 → 브릿지)을 순서대로 하나씩 띄운다.
//  - 빈 스텝은 건너뛴다.  - 진행률("N/M 단계")을 보여준다.
//  - 모든 스텝 확정/건너뛰기 시 "검수 완료" 요약.  - 렌더만으로는 아무것도 반영되지 않는다
//    (모든 변이는 카드 컨펌 콜백 뒤에서만; confirm-gate). 데이터·콜백은 주입(테스트 용이).

type StepKind = 'term' | 'drift' | 'bridge';

const STEP_LABELS: Record<StepKind, string> = {
  term: '용어 확인',
  drift: '패턴 드리프트',
  bridge: '브릿지 연결',
};

export interface PatternReviewData {
  termResolutions: TermResolution[];
  driftPattern: Pattern | null;
  driftJudgments: DriftJudgment[];
  bridges: BridgeSuggestion[];
  partitionNames?: Record<string, string>;
}

export interface PatternReviewSequenceProps extends PatternReviewData {
  onConfirmTerm: (term: string, candidate: TermCandidate) => void;
  onManualTerm: (term: string, meaning: string) => void;
  onExtend: (draft: ExtendedPatternDraft) => void;
  onFork: (elements: DriftElement[]) => void;
  onConnectBridge: (suggestion: BridgeSuggestion) => void;
  onComplete?: () => void;
}

function driftOutsideCount(judgments: DriftJudgment[]): number {
  return judgments.filter((j) => j.decision !== 'map').length;
}

function ReviewProgress({ index, total, kind }: { index: number; total: number; kind: StepKind }) {
  return (
    <div
      data-testid="review-progress"
      className="mb-2 flex items-center gap-1.5 text-[11px] font-medium"
    >
      <span className="text-primary">
        {index + 1}/{total} 단계
      </span>
      <span className="text-muted-foreground">· {STEP_LABELS[kind]}</span>
    </div>
  );
}

function ReviewSummary({ data }: { data: PatternReviewData }) {
  return (
    <div
      data-testid="review-summary"
      className="rounded-lg border border-border bg-card p-3 text-center"
    >
      <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-primary" />
      <p className="text-[12px] font-semibold text-foreground">검수 완료</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        용어 {data.termResolutions.length} · 드리프트{' '}
        {driftOutsideCount(data.driftJudgments)} · 브릿지 {data.bridges.length}
      </p>
    </div>
  );
}

export default function PatternReviewSequence(props: PatternReviewSequenceProps) {
  const { termResolutions, driftPattern, driftJudgments, bridges, partitionNames } = props;
  const [stepIndex, setStepIndex] = useState(0);
  const [termIndex, setTermIndex] = useState(0);
  const [bridgeIndex, setBridgeIndex] = useState(0);

  const hasDrift = driftPattern !== null && driftOutsideCount(driftJudgments) > 0;

  const steps = useMemo<StepKind[]>(() => {
    const list: StepKind[] = [];
    if (termResolutions.length > 0) list.push('term');
    if (hasDrift) list.push('drift');
    if (bridges.length > 0) list.push('bridge');
    return list;
  }, [termResolutions.length, hasDrift, bridges.length]);

  const done = steps.length === 0 || stepIndex >= steps.length;

  const completedRef = useRef(false);
  useEffect(() => {
    if (done && !completedRef.current) {
      completedRef.current = true;
      props.onComplete?.();
    }
  }, [done, props]);

  if (done) return <ReviewSummary data={props} />;

  const current = steps[stepIndex];
  const advanceStep = () => setStepIndex((i) => i + 1);

  return (
    <div className="space-y-2">
      <ReviewProgress index={stepIndex} total={steps.length} kind={current} />
      {current === 'term' &&
        renderTermStep({
          resolution: termResolutions[termIndex],
          termIndex,
          termCount: termResolutions.length,
          onConfirmTerm: props.onConfirmTerm,
          onManualTerm: props.onManualTerm,
          advance: () => {
            if (termIndex + 1 < termResolutions.length) setTermIndex(termIndex + 1);
            else advanceStep();
          },
        })}
      {current === 'drift' && driftPattern && (
        <DriftDecisionCard
          pattern={driftPattern}
          judgments={driftJudgments}
          onExtend={(draft) => {
            props.onExtend(draft);
            advanceStep();
          }}
          onFork={(elements) => {
            props.onFork(elements);
            advanceStep();
          }}
          onIgnore={advanceStep}
        />
      )}
      {current === 'bridge' &&
        renderBridgeStep({
          suggestion: bridges[bridgeIndex],
          partitionNames,
          onConnectBridge: props.onConnectBridge,
          advance: () => {
            if (bridgeIndex + 1 < bridges.length) setBridgeIndex(bridgeIndex + 1);
            else advanceStep();
          },
        })}
    </div>
  );
}

function renderTermStep(args: {
  resolution: TermResolution;
  termIndex: number;
  termCount: number;
  onConfirmTerm: (term: string, candidate: TermCandidate) => void;
  onManualTerm: (term: string, meaning: string) => void;
  advance: () => void;
}) {
  const { resolution, termIndex, termCount, onConfirmTerm, onManualTerm, advance } = args;
  return (
    <TermConfirmCard
      key={`term-${termIndex}`}
      resolution={resolution}
      onConfirm={(candidate) => {
        onConfirmTerm(resolution.term, candidate);
        advance();
      }}
      onManual={(meaning) => {
        onManualTerm(resolution.term, meaning);
        advance();
      }}
      onSkip={advance}
    />
  );
}

function renderBridgeStep(args: {
  suggestion: BridgeSuggestion;
  partitionNames?: Record<string, string>;
  onConnectBridge: (suggestion: BridgeSuggestion) => void;
  advance: () => void;
}) {
  const { suggestion, partitionNames, onConnectBridge, advance } = args;
  return (
    <BridgeSuggestCard
      key={`bridge-${suggestion.sourceId}-${suggestion.targetId}`}
      suggestion={suggestion}
      partitionNames={partitionNames}
      onConnect={(s) => {
        onConnectBridge(s);
        advance();
      }}
      onDistinct={advance}
    />
  );
}
