'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Check, X, SkipForward, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmCard } from '@/components/ui/confirm-card';
import TermConfirmCard from '../terms/TermConfirmCard';
import DriftDecisionCard from './DriftDecisionCard';
import BridgeSuggestCard from '../bridge/BridgeSuggestCard';
import GovernanceProposalCard from '../preview/GovernanceProposalCard';
import EnrichmentCard from '../preview/EnrichmentCard';
import type { TermCandidate, TermResolution } from '../../lib/terms/types';
import type { Pattern } from '../../lib/patterns/types';
import type { DriftElement, DriftJudgment } from '../../lib/patterns/drift';
import type { ExtendedPatternDraft } from '../../lib/patterns/extend';
import type { BridgeSuggestion } from '../../lib/bridge/cross-partition';
import type { HitlDedupItem } from '../../lib/patterns/hitl';
import type { GovernanceProposal } from '../../lib/schemas';
import type { EnrichmentItem } from '../../lib/enrich-types';
import type { CriticIssue, CriticSeverity } from '../../lib/critic/review';

// PRD-H (H8/M5) · PRD-I (M3, Task 3.2): 패턴-시드 생성 후 HITL 검수 시퀀스(순수 step-runner).
// buildHitlPlan 이 정한 스텝(용어 → 중복 → 드리프트 → 거버넌스 → 보강 → Critic → 브릿지)을
// 순서대로 하나씩 띄운다. 팝오버가 다섯 결정을 한 열에 몰아넣던 것을 별개 스텝으로 편다.
//  - 빈 스텝은 건너뛴다.  - 진행률("N/M 단계")을 보여준다.
//  - 모든 스텝 확정/건너뛰기 시 "검수 완료" 요약.  - 렌더만으로는 아무것도 반영되지 않는다
//    (모든 변이는 카드 컨펌 콜백 뒤에서만; confirm-gate). 데이터·콜백은 주입(테스트 용이).

type StepKind =
  | 'term'
  | 'dedup'
  | 'drift'
  | 'governance'
  | 'enrichment'
  | 'critic'
  | 'bridge';

const STEP_LABELS: Record<StepKind, string> = {
  term: '용어 확인',
  dedup: '중복 대조',
  drift: '패턴 드리프트',
  governance: '거버넌스',
  enrichment: '보강',
  critic: '검수 자문',
  bridge: '브릿지 연결',
};

const CRITIC_SEVERITY_LABEL: Record<CriticSeverity, string> = {
  high: '높음',
  med: '중간',
  low: '낮음',
};

export interface PatternReviewData {
  termResolutions: TermResolution[];
  driftPattern: Pattern | null;
  driftJudgments: DriftJudgment[];
  bridges: BridgeSuggestion[];
  partitionNames?: Record<string, string>;
  // PRD-I (M3): 팝오버에서 옮겨온 결정들. 없으면 해당 스텝은 건너뛴다.
  dedup?: HitlDedupItem[];
  governance?: GovernanceProposal[];
  enrichment?: EnrichmentItem[];
  critic?: CriticIssue[];
}

export interface PatternReviewSequenceProps extends PatternReviewData {
  onConfirmTerm: (term: string, candidate: TermCandidate) => void;
  onManualTerm: (term: string, meaning: string) => void;
  onExtend: (draft: ExtendedPatternDraft) => void;
  onFork: (elements: DriftElement[]) => void;
  onConnectBridge: (suggestion: BridgeSuggestion) => void;
  // PRD-I (M3): 새 스텝 콜백. term/bridge 스타일을 그대로 따른다(컨펌 시에만 반영).
  onConfirmDedup?: (item: HitlDedupItem) => void;
  onIgnoreDedup?: (item: HitlDedupItem) => void;
  onApproveGovernance?: (proposal: GovernanceProposal) => void;
  onIgnoreGovernance?: (proposal: GovernanceProposal) => void;
  onAdoptEnrichment?: (item: EnrichmentItem) => void;
  onIgnoreEnrichment?: (item: EnrichmentItem) => void;
  onSourceEnrichment?: (item: EnrichmentItem) => void;
  onAckCritic?: (issue: CriticIssue) => void;
  onIgnoreCritic?: (issue: CriticIssue) => void;
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
        용어 {data.termResolutions.length} · 중복 {(data.dedup ?? []).length} · 드리프트{' '}
        {driftOutsideCount(data.driftJudgments)} · 거버넌스 {(data.governance ?? []).length} · 보강{' '}
        {(data.enrichment ?? []).length} · 자문 {(data.critic ?? []).length} · 브릿지 {data.bridges.length}
      </p>
    </div>
  );
}

export default function PatternReviewSequence(props: PatternReviewSequenceProps) {
  const { termResolutions, driftPattern, driftJudgments, bridges, partitionNames } = props;
  const dedup = props.dedup ?? [];
  const governance = props.governance ?? [];
  const enrichment = props.enrichment ?? [];
  const critic = props.critic ?? [];

  const [stepIndex, setStepIndex] = useState(0);
  const [termIndex, setTermIndex] = useState(0);
  const [dedupIndex, setDedupIndex] = useState(0);
  const [govIndex, setGovIndex] = useState(0);
  const [enrichIndex, setEnrichIndex] = useState(0);
  const [criticIndex, setCriticIndex] = useState(0);
  const [bridgeIndex, setBridgeIndex] = useState(0);

  const hasDrift = driftPattern !== null && driftOutsideCount(driftJudgments) > 0;

  const steps = useMemo<StepKind[]>(() => {
    const list: StepKind[] = [];
    if (termResolutions.length > 0) list.push('term');
    if (dedup.length > 0) list.push('dedup');
    if (hasDrift) list.push('drift');
    if (governance.length > 0) list.push('governance');
    if (enrichment.length > 0) list.push('enrichment');
    if (critic.length > 0) list.push('critic');
    if (bridges.length > 0) list.push('bridge');
    return list;
  }, [
    termResolutions.length,
    dedup.length,
    hasDrift,
    governance.length,
    enrichment.length,
    critic.length,
    bridges.length,
  ]);

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
          onConfirmTerm: props.onConfirmTerm,
          onManualTerm: props.onManualTerm,
          advance: () => {
            if (termIndex + 1 < termResolutions.length) setTermIndex(termIndex + 1);
            else advanceStep();
          },
        })}
      {current === 'dedup' &&
        renderDedupStep({
          item: dedup[dedupIndex],
          onConfirm: props.onConfirmDedup,
          onIgnore: props.onIgnoreDedup,
          advance: () => {
            if (dedupIndex + 1 < dedup.length) setDedupIndex(dedupIndex + 1);
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
      {current === 'governance' &&
        renderGovernanceStep({
          proposal: governance[govIndex],
          onApprove: props.onApproveGovernance,
          onIgnore: props.onIgnoreGovernance,
          advance: () => {
            if (govIndex + 1 < governance.length) setGovIndex(govIndex + 1);
            else advanceStep();
          },
        })}
      {current === 'enrichment' &&
        renderEnrichmentStep({
          item: enrichment[enrichIndex],
          onAdopt: props.onAdoptEnrichment,
          onIgnore: props.onIgnoreEnrichment,
          onSource: props.onSourceEnrichment,
          advance: () => {
            if (enrichIndex + 1 < enrichment.length) setEnrichIndex(enrichIndex + 1);
            else advanceStep();
          },
        })}
      {current === 'critic' &&
        renderCriticStep({
          issue: critic[criticIndex],
          onAck: props.onAckCritic,
          onIgnore: props.onIgnoreCritic,
          advance: () => {
            if (criticIndex + 1 < critic.length) setCriticIndex(criticIndex + 1);
            else advanceStep();
          },
        })}
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
  onConfirmTerm: (term: string, candidate: TermCandidate) => void;
  onManualTerm: (term: string, meaning: string) => void;
  advance: () => void;
}) {
  const { resolution, termIndex, onConfirmTerm, onManualTerm, advance } = args;
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

// PRD-I (M3): 중복 대조 스텝 — 공통 ConfirmCard 로 판정→근거→미리보기→액션을 렌더한다.
function renderDedupStep(args: {
  item: HitlDedupItem;
  onConfirm?: (item: HitlDedupItem) => void;
  onIgnore?: (item: HitlDedupItem) => void;
  advance: () => void;
}) {
  const { item, onConfirm, onIgnore, advance } = args;
  const detail = [
    item.targetName && `대상: ${item.targetName}`,
    item.relationType && `관계: ${item.relationType}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ConfirmCard
      key={`dedup-${item.name}`}
      eyebrow="중복 대조"
      verdict={item.decision === 'new' ? undefined : item.decision}
      title={item.name}
      evidence={item.evidence || undefined}
      preview={
        detail ? <p className="text-[10px] text-muted-foreground">{detail}</p> : undefined
      }
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-0.5 px-2 text-[10px]"
            onClick={() => {
              onIgnore?.(item);
              advance();
            }}
          >
            <SkipForward className="h-3 w-3" />
            건너뛰기
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-6 gap-0.5 px-2 text-[10px]"
            onClick={() => {
              onConfirm?.(item);
              advance();
            }}
          >
            <Check className="h-3 w-3" />
            이 판정으로
          </Button>
        </>
      }
    />
  );
}

function renderGovernanceStep(args: {
  proposal: GovernanceProposal;
  onApprove?: (proposal: GovernanceProposal) => void;
  onIgnore?: (proposal: GovernanceProposal) => void;
  advance: () => void;
}) {
  const { proposal, onApprove, onIgnore, advance } = args;
  return (
    <GovernanceProposalCard
      key={`gov-${proposal.title}`}
      proposal={proposal}
      applied={false}
      onApprove={() => {
        onApprove?.(proposal);
        advance();
      }}
      onIgnore={() => {
        onIgnore?.(proposal);
        advance();
      }}
    />
  );
}

function renderEnrichmentStep(args: {
  item: EnrichmentItem;
  onAdopt?: (item: EnrichmentItem) => void;
  onIgnore?: (item: EnrichmentItem) => void;
  onSource?: (item: EnrichmentItem) => void;
  advance: () => void;
}) {
  const { item, onAdopt, onIgnore, onSource, advance } = args;
  return (
    <EnrichmentCard
      key={`enrich-${item.id}`}
      item={item}
      adopted={false}
      onAdopt={() => {
        onAdopt?.(item);
        advance();
      }}
      onIgnore={() => {
        onIgnore?.(item);
        advance();
      }}
      // 소싱은 카드에 머문다(확정 아님) — 콜백만 알린다.
      onSource={() => onSource?.(item)}
    />
  );
}

// PRD-I (M3): Critic 자문 스텝 — 읽기전용 자문. 확정을 막지 않으며 확인/무시로 넘긴다.
function renderCriticStep(args: {
  issue: CriticIssue;
  onAck?: (issue: CriticIssue) => void;
  onIgnore?: (issue: CriticIssue) => void;
  advance: () => void;
}) {
  const { issue, onAck, onIgnore, advance } = args;
  const title = issue.relatedName
    ? `${issue.targetName} ↔ ${issue.relatedName}`
    : issue.targetName;
  return (
    <ConfirmCard
      key={`critic-${issue.ruleId}-${issue.targetName}`}
      eyebrow={`검수 자문 · ${CRITIC_SEVERITY_LABEL[issue.severity]}`}
      attention={issue.severity === 'high'}
      title={title}
      evidence={issue.reason}
      preview={
        issue.suggestion ? (
          <p className="text-[10px] text-muted-foreground">{issue.suggestion}</p>
        ) : undefined
      }
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-0.5 px-2 text-[10px]"
            onClick={() => {
              onIgnore?.(issue);
              advance();
            }}
          >
            <X className="h-3 w-3" />
            무시
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-0.5 px-2 text-[10px]"
            onClick={() => {
              onAck?.(issue);
              advance();
            }}
          >
            <ShieldAlert className="h-3 w-3" />
            확인
          </Button>
        </>
      }
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
