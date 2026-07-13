'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  Loader2,
  Boxes,
  Box,
  Link2,
  Unplug,
  CircleDashed,
  Copy,
  ShieldAlert,
  PieChart,
  UploadCloud,
  GitFork,
  Trash2,
  Database,
  Percent,
  Clock,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { healthApi, validateApi, type HealthMetrics, type ValidationResult } from '../api';
import { findStructureIssues } from '../lib/graph-health';
import { analyzeConnectivity } from '../lib/validate/connectivity';
import {
  evaluateCompetencyQuestions,
  buildGraphPathChecker,
  type CqGraphEdge,
} from '../lib/validate/cq';
import MetricCard from './health/MetricCard';
import ViolationList from './health/ViolationList';
import ConnectivityCqSection from './health/ConnectivityCqSection';
import { computeGrounding, STALE_DAYS } from '../lib/metrics/grounding';

export default function HealthDashboardSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const selectNode = useOntologyStore((s) => s.selectNode);
  const focusNode = useOntologyStore((s) => s.focusNode);
  const edges = useOntologyStore((s) => s.edges);
  const storeClasses = useOntologyStore((s) => s.classes);
  const storeInstances = useOntologyStore((s) => s.instances);
  const properties = useOntologyStore((s) => s.properties);
  const instanceValues = useOntologyStore((s) => s.instanceValues);
  const relationTypes = useOntologyStore((s) => s.relationTypes);
  const removeEdge = useOntologyStore((s) => s.removeEdge);
  const activePatternCq = useOntologyStore((s) => s.activePatternCq);

  // H7(M5): 연결성(도달성) — "섬 없음" 오탐 교정. 인스턴스까지 노드로 포함.
  const connectivity = useMemo(() => {
    const nodes = [
      ...storeClasses.map((c) => ({ id: c.id })),
      ...storeInstances.map((i) => ({ id: i.id })),
    ];
    return analyzeConnectivity(
      nodes,
      edges.map((e) => ({ sourceId: e.sourceId, targetId: e.targetId })),
    );
  }, [storeClasses, storeInstances, edges]);

  // H7(M5): 활성 패턴의 CQ 세트로 답 경로 유무를 점검해 통과율(N/M)을 낸다.
  const cqPassRate = useMemo(() => {
    if (!activePatternCq) return null;
    const relName = (rtId: string) =>
      relationTypes.find((r) => r.id === rtId)?.name ?? '';
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

  // 클라이언트 구조 점검(자기 루프·중복 엣지). 서버 지표와 별개로 즉시 계산.
  const structureIssues = useMemo(() => {
    const nodeName = (id: string) =>
      storeClasses.find((c) => c.id === id)?.name ??
      storeInstances.find((i) => i.id === id)?.name ??
      '?';
    const relName = (rtId: string) => relationTypes.find((r) => r.id === rtId)?.name ?? 'relation';
    return findStructureIssues(edges, nodeName, relName);
  }, [edges, storeClasses, storeInstances, relationTypes]);

  // PRD-N M3: 데이터 접지(바인딩률·채움률·신선도) — store 배열로 라이브 계산.
  const grounding = useMemo(
    () =>
      computeGrounding({
        classes: storeClasses,
        instances: storeInstances,
        properties,
        instanceValues,
      }),
    [storeClasses, storeInstances, properties, instanceValues],
  );

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([healthApi.get(), validateApi.run()])
      .then(([h, v]) => {
        setMetrics(h.metrics);
        setValidation(v);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : '건강도를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleJump = useCallback(
    (targetId: string, targetTable: string) => {
      if (targetTable === 'classes') selectNode(targetId, 'class');
      else if (targetTable === 'instances') selectNode(targetId, 'instance');
      focusNode(targetId);
      onOpenChange(false);
    },
    [selectNode, focusNode, onOpenChange],
  );

  const errorCount = validation?.summary.errors ?? 0;
  const warningCount = validation?.summary.warnings ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[440px] sm:max-w-[440px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Activity className="w-4 h-4 text-primary" />
            온톨로지 건강도
          </SheetTitle>
          <SheetDescription className="text-xs">
            working 그래프의 품질 지표와 검증 위반을 한눈에 확인합니다.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-end py-2">
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : '새로고침'}
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0 -mx-1 px-1">
          {loading && !metrics ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : metrics ? (
            <div className="space-y-4 pb-4">
              <div className="grid grid-cols-2 gap-2">
                <MetricCard icon={Boxes} label="클래스" value={metrics.classes} />
                <MetricCard icon={Box} label="인스턴스" value={metrics.instances} />
                <MetricCard icon={Link2} label="관계(엣지)" value={metrics.edges} />
                <MetricCard
                  icon={PieChart}
                  label="인스턴스 커버리지"
                  value={`${Math.round(metrics.coverage * 100)}%`}
                  hint="인스턴스를 가진 클래스 비율"
                />
                <MetricCard
                  icon={Unplug}
                  label="고아 노드"
                  value={metrics.orphanNodes}
                  tone={metrics.orphanNodes > 0 ? 'warning' : 'default'}
                />
                <MetricCard
                  icon={CircleDashed}
                  label="빈 클래스"
                  value={metrics.emptyClasses}
                  tone={metrics.emptyClasses > 0 ? 'warning' : 'default'}
                />
                <MetricCard
                  icon={Copy}
                  label="중복 후보"
                  value={metrics.duplicateCandidates}
                  tone={metrics.duplicateCandidates > 0 ? 'warning' : 'default'}
                />
                <MetricCard
                  icon={ShieldAlert}
                  label="검증 위반"
                  value={errorCount + warningCount}
                  tone={errorCount > 0 ? 'danger' : warningCount > 0 ? 'warning' : 'success'}
                  hint={`오류 ${errorCount} · 경고 ${warningCount}`}
                />
                <MetricCard
                  icon={UploadCloud}
                  label="미반영 커밋"
                  value={metrics.unpushedChanges}
                  tone={metrics.unpushedChanges > 0 ? 'warning' : 'success'}
                  hint="Neo4j에 push되지 않은 커밋"
                />
                <MetricCard
                  icon={GitFork}
                  label="구조 결함"
                  value={structureIssues.length}
                  tone={structureIssues.length > 0 ? 'warning' : 'success'}
                  hint="자기 루프·중복 엣지"
                />
                {/* PRD-N M3: 데이터 접지 축 */}
                <MetricCard
                  icon={Database}
                  label="데이터 바인딩률"
                  value={`${Math.round(grounding.bindingRate * 100)}%`}
                  tone={grounding.bindingRate < 0.5 ? 'warning' : 'success'}
                  hint={`실데이터로 접지된 클래스 ${grounding.boundClasses}/${grounding.totalClasses}`}
                />
                <MetricCard
                  icon={Percent}
                  label="속성 채움률"
                  value={`${Math.round(grounding.fillRate * 100)}%`}
                  hint="인스턴스가 실제 값으로 채운 속성 비율"
                />
                <MetricCard
                  icon={Clock}
                  label="데이터 신선도"
                  value={grounding.oldestAgeDays === null ? '—' : `${grounding.oldestAgeDays}일 전`}
                  tone={grounding.stalePartitionIds.length > 0 ? 'warning' : 'default'}
                  hint={
                    grounding.stalePartitionIds.length > 0
                      ? `${grounding.stalePartitionIds.length}개 구획이 ${STALE_DAYS}일 넘게 미갱신`
                      : '가장 오래된 구획 데이터 기준'
                  }
                />
              </div>

              <ConnectivityCqSection connectivity={connectivity} cq={cqPassRate} />

              <div>
                <h3 className="text-xs font-semibold text-muted-foreground mb-1.5">검증 위반</h3>
                <ViolationList result={validation} onJump={handleJump} />
              </div>

              {structureIssues.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground mb-1.5">
                    구조 점검 ({structureIssues.length})
                  </h3>
                  <div className="space-y-1">
                    {structureIssues.map((it) => (
                      <div
                        key={it.edgeId}
                        className="flex items-center gap-2 py-1.5 px-2 rounded border border-warning/30 bg-warning/10 group"
                      >
                        <span className="shrink-0 rounded px-1 text-xs font-medium bg-warning/20 text-warning">
                          {it.kind === 'self_loop' ? '자기 루프' : '중복'}
                        </span>
                        <button
                          className="text-xs text-foreground truncate flex-1 text-left hover:text-primary transition-colors"
                          onClick={() => handleJump(it.sourceId, it.sourceKind === 'class' ? 'classes' : 'instances')}
                        >
                          {it.label}
                        </button>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => removeEdge(it.edgeId)}
                          aria-label="이 관계 삭제"
                          title="이 관계 삭제"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-muted-foreground">데이터가 없습니다</div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
