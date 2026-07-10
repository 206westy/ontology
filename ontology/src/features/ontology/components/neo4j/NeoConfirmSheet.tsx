'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { m, AnimatePresence } from 'motion/react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildPublishLicenseWarning } from '../../lib/patterns/license';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useOntologyStore, clearChangesWithoutHistory } from '../../hooks/useOntologyStore';
import { commitsApi, neo4jApi, type Neo4jPushStep } from '../../api';
import { toast } from 'sonner';
import PushSummary, { computePushSummary } from './PushSummary';
import CypherPreview from './CypherPreview';
import PushProgress, { type PushStep } from './PushProgress';
import PushResult, { type PushError } from './PushResult';

type Phase = 'loading' | 'confirm' | 'pushing' | 'result';

interface NeoConfirmSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function apiStepsToUiSteps(apiSteps: Neo4jPushStep[]): PushStep[] {
  return apiSteps.map((s) => ({
    label: s.description,
    status: s.status === 'success' ? 'done' : s.status === 'error' ? 'error' : 'pending',
  }));
}

export default function NeoConfirmSheet({ open, onOpenChange }: NeoConfirmSheetProps) {
  const pendingChanges = useOntologyStore((s) => s.pendingChanges);
  const markPublished = useOntologyStore((s) => s.markPublished);
  // PRD-H T7 (M2): 이 생성에 사용된 패턴의 라이선스가 미확인이면 발행 전 경고(warn-only).
  const activePattern = useOntologyStore((s) => s.activePattern);
  const licenseWarning = buildPublishLicenseWarning([activePattern]);

  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>('loading');
  const [cypherPreview, setCypherPreview] = useState('');
  const [commitIds, setCommitIds] = useState<string[]>([]);
  const [steps, setSteps] = useState<PushStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [pushResult, setPushResult] = useState<{
    success: boolean;
    totalQueries: number;
    successCount: number;
    failedCount: number;
    errors: PushError[];
    durationMs: number;
  } | null>(null);
  const startTimeRef = useRef(0);

  const summary = computePushSummary(pendingChanges);

  // When sheet opens: commit to Supabase, then dryRun to get preview
  useEffect(() => {
    if (!open) return;

    setPhase('loading');
    setCypherPreview('');
    setCommitIds([]);
    setSteps([]);
    setCurrentStepIndex(0);
    setPushResult(null);

    let cancelled = false;

    async function prepare() {
      try {
        // 1. 현재 편집(pendingChanges)이 있으면 먼저 커밋(Supabase 스테이징).
        let ids: string[] = [];
        if (pendingChanges.length > 0) {
          const opCounts = { ADD: 0, MOD: 0, DEL: 0 };
          pendingChanges.forEach((c) => {
            const op = c.operation as keyof typeof opCounts;
            if (op in opCounts) opCounts[op]++;
          });

          const commitResult = (await commitsApi.create({
            message: `${opCounts.ADD} added, ${opCounts.MOD} modified, ${opCounts.DEL} deleted`,
            isAutoSave: false,
            details: pendingChanges.map((c) => ({
              operation: c.operation as 'ADD' | 'MOD' | 'DEL',
              targetTable: c.targetTable,
              targetId: c.targetId,
            })),
          })) as { id: string };
          if (cancelled) return;
          ids.push(commitResult.id);
        }

        // 2. 미반영 커밋 전체를 합친다(autosave/이전 저장으로 스테이징엔 있으나
        //    Neo4j 로 반영 안 된 "고아 커밋" 포함). 이게 반영본이 비던 진짜 원인.
        try {
          const unpushed = await commitsApi.unpushed();
          ids = [...new Set([...ids, ...unpushed.ids])];
        } catch {
          // 미반영 조회 실패해도 방금 만든 커밋은 반영 진행.
        }
        if (cancelled) return;

        if (ids.length === 0) {
          toast.info('반영할 변경이 없습니다', {
            description: '모든 변경이 이미 Neo4j(반영본)에 반영되어 있습니다.',
          });
          onOpenChange(false);
          return;
        }

        setCommitIds(ids);

        // 3. DryRun to get cypher preview and steps
        const preview = await neo4jApi.push({ commitIds: ids, dryRun: true });
        if (cancelled) return;

        setCypherPreview(preview.cypherPreview ?? '');
        setSteps(apiStepsToUiSteps(preview.steps));
        setPhase('confirm');
      } catch {
        if (cancelled) return;
        // Fallback: show confirm with local-generated preview
        setCypherPreview(generateLocalCypherPreview(pendingChanges));
        setPhase('confirm');
      }
    }

    prepare();
    return () => { cancelled = true; };
  }, [open, pendingChanges]);

  // Prevent closing while pushing
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (phase === 'pushing' || phase === 'loading') return;
      onOpenChange(nextOpen);
    },
    [phase, onOpenChange],
  );

  const handlePush = useCallback(async () => {
    if (commitIds.length === 0) {
      toast.error('커밋 ID가 없습니다', { description: '다시 시도해주세요.' });
      return;
    }

    setPhase('pushing');
    startTimeRef.current = Date.now();

    // Show running animation on all steps
    setSteps((prev) =>
      prev.map((s, i) => (i === 0 ? { ...s, status: 'running' } : s)),
    );
    setCurrentStepIndex(0);

    try {
      const result = await neo4jApi.push({ commitIds, dryRun: false });
      const durationMs = Date.now() - startTimeRef.current;

      const uiSteps = apiStepsToUiSteps(result.steps);
      setSteps(uiSteps);
      setCurrentStepIndex(uiSteps.length);

      const successCount = result.steps.filter((s) => s.status === 'success').length;
      const failedSteps = result.steps.filter((s) => s.status === 'error');

      setPushResult({
        success: result.success,
        totalQueries: result.steps.length,
        successCount,
        failedCount: failedSteps.length,
        errors: failedSteps.map((s) => ({
          label: s.description,
          message: s.error ?? '알 수 없는 오류',
        })),
        durationMs,
      });

      if (result.success) {
        clearChangesWithoutHistory();
        // PRD-I (M4): 발행(published) 성공 시점 기록 — 라이프사이클 표시용.
        markPublished();
        // 미반영 커밋을 전부 반영했으니 카운트/히스토리 갱신(반영본 push 후 상태 동기화).
        qc.invalidateQueries({ queryKey: ['commits'] });
      }

      // H2: Neo4j 반영은 됐으나 스테이징 플래그 갱신이 실패한 부분 성공을 알린다.
      if (result.warning) {
        toast.warning('부분 성공', {
          description: result.warning,
          duration: 8000,
        });
      }

      setPhase('result');
    } catch (err) {
      const durationMs = Date.now() - startTimeRef.current;
      setPushResult({
        success: false,
        totalQueries: steps.length,
        successCount: 0,
        failedCount: steps.length,
        errors: [{
          label: '네트워크 오류',
          message: err instanceof Error ? err.message : '서버에 연결할 수 없습니다',
        }],
        durationMs,
      });
      setPhase('result');
    }
  }, [commitIds, steps.length, markPublished, qc]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // PRD-K M5: "반영/푸시" 혼용을 "발행"으로 통일.
  const phaseTitle = {
    loading: '발행 준비 중...',
    confirm: '운영 그래프에 발행',
    pushing: '발행 중...',
    result: pushResult?.success ? '발행 완료' : '발행 부분 실패',
  }[phase];

  // PRD-K M5: 발행 전 사전 요약 한 줄 — 무엇이 운영 그래프로 나가는지 평문으로.
  const publishSentence = (() => {
    const parts = [
      { label: '클래스', c: summary.classes },
      { label: '관계', c: summary.relations },
      { label: '인스턴스', c: summary.instances },
      { label: '속성', c: summary.properties },
      { label: '연결', c: summary.edges },
    ]
      .map(({ label, c }) => ({ label, total: c.add + c.mod + c.del }))
      .filter((p) => p.total > 0)
      .map((p) => `${p.label} ${p.total}`);
    return parts.length > 0 ? `${parts.join(' · ')}을(를) 운영 그래프(Neo4j)에 발행합니다.` : null;
  })();

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[50vh]"
        data-testid="neo-confirm-sheet"
        onInteractOutside={(e) => {
          if (phase === 'pushing' || phase === 'loading') e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (phase === 'pushing' || phase === 'loading') e.preventDefault();
        }}
      >
        <SheetHeader>
          <SheetTitle className="text-sm flex items-center gap-2">
            {(phase === 'pushing' || phase === 'loading') && (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            )}
            {phaseTitle}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 overflow-y-auto max-h-[calc(50vh-80px)]">
          <AnimatePresence mode="wait">
            {phase === 'loading' && (
              <m.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-8 gap-3"
              >
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Cypher 구문을 생성하고 있습니다...</p>
              </m.div>
            )}

            {phase === 'confirm' && (
              <m.div
                key="confirm"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                {publishSentence && (
                  <p
                    className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground"
                    data-testid="publish-summary-sentence"
                  >
                    {publishSentence}{' '}
                    <span className="text-muted-foreground">
                      발행 후에도 스테이징 이력은 그대로 남습니다.
                    </span>
                  </p>
                )}
                <PushSummary summary={summary} />

                {licenseWarning && (
                  <div
                    className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-warning"
                    data-testid="publish-license-warning"
                  >
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{licenseWarning}</span>
                  </div>
                )}

                <CypherPreview cypher={cypherPreview} />

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={handleClose}
                  >
                    취소
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1 bg-success hover:bg-success/90 text-white"
                    onClick={handlePush}
                  >
                    발행 실행
                  </Button>
                </div>
              </m.div>
            )}

            {phase === 'pushing' && (
              <m.div
                key="pushing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <PushProgress
                  steps={steps}
                  currentIndex={currentStepIndex}
                  totalSteps={steps.length}
                />
              </m.div>
            )}

            {phase === 'result' && pushResult && (
              <m.div
                key="result"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <PushResult
                  success={pushResult.success}
                  totalQueries={pushResult.totalQueries}
                  successCount={pushResult.successCount}
                  failedCount={pushResult.failedCount}
                  errors={pushResult.errors}
                  durationMs={pushResult.durationMs}
                  onClose={handleClose}
                  onRetryFailed={
                    pushResult.failedCount > 0
                      ? () => handlePush()
                      : undefined
                  }
                  onSkipFailed={
                    pushResult.failedCount > 0
                      ? () => {
                          clearChangesWithoutHistory();
                          handleClose();
                        }
                      : undefined
                  }
                />
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function generateLocalCypherPreview(
  changes: { operation: string; targetTable: string; targetId: string; targetName: string }[],
): string {
  const lines: string[] = [];

  changes.forEach((c) => {
    if (c.operation === 'ADD') {
      if (c.targetTable === 'classes') {
        lines.push(`CREATE (n:Class {id: '${c.targetId}', name: '${c.targetName}'})`);
      } else if (c.targetTable === 'instances') {
        lines.push(`CREATE (n:Instance {id: '${c.targetId}', name: '${c.targetName}'})`);
      } else if (c.targetTable === 'edges' || c.targetTable === 'relation_types') {
        lines.push(`// 관계 생성: ${c.targetName}`);
      }
    } else if (c.operation === 'MOD') {
      lines.push(`MATCH (n {id: '${c.targetId}'}) SET n.name = '${c.targetName}'`);
    } else if (c.operation === 'DEL') {
      if (c.targetTable === 'edges') {
        lines.push(`MATCH ()-[r {id: '${c.targetId}'}]-() DELETE r`);
      } else {
        lines.push(`MATCH (n {id: '${c.targetId}'}) DETACH DELETE n`);
      }
    }
  });

  return lines.join('\n');
}
