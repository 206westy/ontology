'use client';

import { useDeferredValue, useMemo } from 'react';
import {
  FileEdit,
  CheckCircle2,
  UploadCloud,
  ChevronRight,
  Split,
  CircleCheck,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { analyzeConnectivity } from '../lib/validate/connectivity';
import {
  evaluateCompetencyQuestions,
  buildGraphPathChecker,
  type CqGraphEdge,
} from '../lib/validate/cq';

// PRD-I (M4): 온톨로지가 지금 초안/확정/발행 어느 단계인지 알려주는 컴팩트 프레이밍.
// 상태를 재배치하지 않고 CommitBar 좌측에 additive 로 붙는다 — 기존 액션·문구 유지.

export type LifecycleState = 'draft' | 'committed' | 'published';

// 순수 파생: 편집 대기 > 발행 > 확정 순으로 판정한다.
// - 편집(pending)이 있으면 무조건 초안.
// - 발행 시각이 있고 그 뒤에 재커밋이 없으면 발행.
// - 그 외 커밋 시각이 있으면 확정.
// - 아무 기록도 없으면 초안(기저 상태).
export function deriveLifecycleState(input: {
  hasPendingChanges: boolean;
  lastCommittedAt: string | null;
  lastPublishedAt: string | null;
}): LifecycleState {
  if (input.hasPendingChanges) return 'draft';
  if (
    input.lastPublishedAt &&
    (!input.lastCommittedAt || input.lastPublishedAt >= input.lastCommittedAt)
  ) {
    return 'published';
  }
  if (input.lastCommittedAt) return 'committed';
  return 'draft';
}

const STAGE_ORDER: Record<LifecycleState, number> = {
  draft: 0,
  committed: 1,
  published: 2,
};

const STAGES: { key: LifecycleState; label: string; icon: LucideIcon; title: string }[] = [
  { key: 'draft', label: '초안', icon: FileEdit, title: '편집 대기 중 — 변경사항이 스테이징(초안)에 있습니다.' },
  { key: 'committed', label: '확정', icon: CheckCircle2, title: '확정 — Supabase에 저장(스테이징 보관)되었고 아직 운영 반영 전입니다.' },
  { key: 'published', label: '발행', icon: UploadCloud, title: '발행 — 운영(Neo4j)에 반영 완료되었습니다.' },
];

// 활성 단계 색 = semantic 토큰(하드코딩 팔레트 금지). 지난 단계는 muted, 이후 단계는 흐리게.
const ACTIVE_TONE: Record<LifecycleState, string> = {
  draft: 'border-warning/40 bg-warning/15 text-warning',
  committed: 'border-info/40 bg-info/15 text-info',
  published: 'border-success/40 bg-success/15 text-success',
};

interface LifecycleIndicatorProps {
  onOpenChanges: () => void;
  onPublish: () => void;
}

export default function LifecycleIndicator({ onOpenChanges, onPublish }: LifecycleIndicatorProps) {
  const pendingChanges = useOntologyStore((s) => s.pendingChanges);
  const lastCommittedAt = useOntologyStore((s) => s.lastCommittedAt);
  const lastPublishedAt = useOntologyStore((s) => s.lastPublishedAt);
  // PRD-Perf M1-3: 연결성/CQ 전체 순회가 편집 프레임을 막지 않도록 입력을 지연값으로.
  const classes = useDeferredValue(useOntologyStore((s) => s.classes));
  const instances = useDeferredValue(useOntologyStore((s) => s.instances));
  const edges = useDeferredValue(useOntologyStore((s) => s.edges));
  const relationTypes = useDeferredValue(useOntologyStore((s) => s.relationTypes));
  const activePatternCq = useOntologyStore((s) => s.activePatternCq);

  const state = deriveLifecycleState({
    hasPendingChanges: pendingChanges.length > 0,
    lastCommittedAt,
    lastPublishedAt,
  });

  // 연결성 칩 — HealthDashboard 와 동일 파생(순수). 노드가 없으면 표시하지 않는다.
  const connectivity = useMemo(() => {
    const nodes = [
      ...classes.map((c) => ({ id: c.id })),
      ...instances.map((i) => ({ id: i.id })),
    ];
    return analyzeConnectivity(
      nodes,
      edges.map((e) => ({ sourceId: e.sourceId, targetId: e.targetId })),
    );
  }, [classes, instances, edges]);

  // CQ 칩 — 활성 패턴 CQ 가 있을 때만. 없으면 가짜 통과를 만들지 않고 아무 것도 렌더하지 않는다.
  const cq = useMemo(() => {
    if (!activePatternCq) return null;
    const relName = (rtId: string) => relationTypes.find((r) => r.id === rtId)?.name ?? '';
    const cqEdges: CqGraphEdge[] = edges.map((e) => ({
      sourceId: e.sourceId,
      targetId: e.targetId,
      relationName: relName(e.relationTypeId),
    }));
    return evaluateCompetencyQuestions(
      activePatternCq.competencyQuestions,
      activePatternCq.traversalTemplates,
      buildGraphPathChecker(cqEdges),
    );
  }, [activePatternCq, edges, relationTypes]);

  return (
    <div className="flex items-center gap-1.5" data-testid="lifecycle-indicator" data-state={state}>
      <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5">
        {STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          const isActive = stage.key === state;
          const isPast = STAGE_ORDER[stage.key] < STAGE_ORDER[state];
          const handleClick =
            stage.key === 'draft' ? onOpenChanges : stage.key === 'published' ? onPublish : undefined;

          const segmentClass = cn(
            'flex items-center gap-0.5 rounded px-1.5 h-5 text-[11px] font-medium border border-transparent transition-colors',
            isActive
              ? ACTIVE_TONE[stage.key]
              : isPast
                ? 'text-muted-foreground'
                : 'text-muted-foreground/40',
          );

          return (
            <div key={stage.key} className="flex items-center">
              {idx > 0 && <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/40" />}
              {handleClick ? (
                <button
                  type="button"
                  onClick={handleClick}
                  className={cn(segmentClass, 'hover:bg-muted')}
                  title={stage.title}
                  data-testid={`lifecycle-stage-${stage.key}`}
                >
                  <Icon className="w-3 h-3" />
                  {stage.label}
                </button>
              ) : (
                <span
                  className={segmentClass}
                  title={stage.title}
                  data-testid={`lifecycle-stage-${stage.key}`}
                >
                  <Icon className="w-3 h-3" />
                  {stage.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {connectivity.nodeCount > 0 && (
        <Badge
          variant="outline"
          className={cn(
            'h-5 gap-0.5 px-1.5 text-[11px] shrink-0',
            connectivity.isConnected ? 'border-success/50 text-success' : 'border-warning/50 text-warning',
          )}
          title={connectivity.warning ?? '단일 연결 그래프입니다.'}
          data-testid="lifecycle-connectivity-chip"
        >
          <Split className="w-2.5 h-2.5" />
          {connectivity.isConnected ? '연결 OK' : `${connectivity.componentCount}개 분리`}
        </Badge>
      )}

      {cq && (
        <Badge
          variant="outline"
          className={cn(
            'h-5 gap-0.5 px-1.5 text-[11px] shrink-0',
            cq.passRate >= 1 ? 'border-success/50 text-success' : 'border-warning/50 text-warning',
          )}
          title="활성 패턴 CQ(핵심 질문) 통과율"
          data-testid="lifecycle-cq-chip"
        >
          <CircleCheck className="w-2.5 h-2.5" />
          CQ {cq.label}
        </Badge>
      )}
    </div>
  );
}
