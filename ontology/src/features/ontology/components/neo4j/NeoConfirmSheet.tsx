'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
        // 1. Commit to Supabase first
        const opCounts = { ADD: 0, MOD: 0, DEL: 0 };
        pendingChanges.forEach((c) => {
          const op = c.operation as keyof typeof opCounts;
          if (op in opCounts) opCounts[op]++;
        });

        const commitResult = await commitsApi.create({
          message: `${opCounts.ADD} added, ${opCounts.MOD} modified, ${opCounts.DEL} deleted`,
          isAutoSave: false,
          details: pendingChanges.map((c) => ({
            operation: c.operation as 'ADD' | 'MOD' | 'DEL',
            targetTable: c.targetTable,
            targetId: c.targetId,
          })),
        }) as { id: string };

        if (cancelled) return;

        const ids = [commitResult.id];
        setCommitIds(ids);

        // 2. DryRun to get cypher preview and steps
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
  }, [commitIds, steps.length]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const phaseTitle = {
    loading: 'Neo4j 푸시 준비 중...',
    confirm: 'Neo4j 푸시',
    pushing: 'Neo4j 푸시 중...',
    result: pushResult?.success ? '푸시 완료' : '푸시 부분 실패',
  }[phase];

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
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-8 gap-3"
              >
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Cypher 구문을 생성하고 있습니다...</p>
              </motion.div>
            )}

            {phase === 'confirm' && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                <PushSummary summary={summary} />
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
                    className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handlePush}
                  >
                    푸시 실행
                  </Button>
                </div>
              </motion.div>
            )}

            {phase === 'pushing' && (
              <motion.div
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
              </motion.div>
            )}

            {phase === 'result' && pushResult && (
              <motion.div
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
              </motion.div>
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
