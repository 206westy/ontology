'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Undo2, List, ArrowUpCircle, GitCommitHorizontal, Loader2, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useOntologyStore, useTemporalStore, clearChangesWithoutHistory } from '../hooks/useOntologyStore';
import { commitsApi, embeddingsApi } from '../api';
import { toast } from 'sonner';
import NeoConfirmSheet from './neo4j/NeoConfirmSheet';
import CommitHistoryPanel from './CommitHistoryPanel';
import AutoSaveIndicator, { type AutoSaveState } from './AutoSaveIndicator';
import LifecycleIndicator from './LifecycleIndicator';
import { useAutoSave } from '../hooks/useAutoSave';

const OP_STYLES: Record<string, { label: string; className: string }> = {
  ADD: { label: 'ADD', className: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-700' },
  MOD: { label: 'MOD', className: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-700' },
  DEL: { label: 'DEL', className: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-400 dark:border-red-700' },
};

export default function CommitBar() {
  const pendingChanges = useOntologyStore((s) => s.pendingChanges);
  const markCommitted = useOntologyStore((s) => s.markCommitted);
  // PRD-J M2: 브랜치 모드 — 커밋은 브랜치로, 발행(Neo4j)은 main 전용.
  const currentBranch = useOntologyStore((s) => s.currentBranch);
  const undo = useTemporalStore((s) => s.undo);
  const [showChanges, setShowChanges] = useState(false);
  const [showNeoPush, setShowNeoPush] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const {
    enabled: autoSaveEnabled,
    toggle: toggleAutoSave,
    status: autoSaveStatus,
  } = useAutoSave();

  const opCounts = useMemo(() => {
    const counts = { ADD: 0, MOD: 0, DEL: 0 };
    pendingChanges.forEach((c) => {
      const op = c.operation as keyof typeof counts;
      if (op in counts) counts[op]++;
    });
    return counts;
  }, [pendingChanges]);

  const [isCommitting, setIsCommitting] = useState(false);
  const hasChanges = pendingChanges.length > 0;

  // 미반영(Neo4j 반영 안 됨) 커밋 수 — autosave/저장으로 스테이징엔 있으나
  // 아직 운영(Neo4j)으로 발행 안 된 변경. 이게 있으면 pendingChanges 가 비어도
  // "반영"을 눌러 반영본을 채울 수 있어야 한다(예전엔 버튼이 막혀 push 불가였음).
  const { data: unpushed } = useQuery({
    queryKey: ['commits', 'unpushed'],
    queryFn: () => commitsApi.unpushed(),
    staleTime: 10_000,
  });
  const unpushedCount = unpushed?.count ?? 0;
  const canPublish = hasChanges || unpushedCount > 0;

  // C3: 자동 저장 실패/진행 상태를 인디케이터에 반영(예전엔 수동 커밋 상태만 봤음).
  const autoSaveState: AutoSaveState =
    autoSaveStatus === 'error'
      ? 'error'
      : isCommitting || autoSaveStatus === 'saving'
        ? 'saving'
        : hasChanges
          ? 'unsaved'
          : 'idle';

  const handleCommit = async () => {
    setIsCommitting(true);
    try {
      await commitsApi.create({
        message: `${opCounts.ADD} added, ${opCounts.MOD} modified, ${opCounts.DEL} deleted`,
        isAutoSave: false,
        // PRD-J M2: 브랜치 모드면 브랜치 커밋(main 미적용, 병합으로만 반영).
        branchId: currentBranch?.id ?? null,
        details: pendingChanges.map((c) => ({
          operation: c.operation as 'ADD' | 'MOD' | 'DEL',
          targetTable: c.targetTable,
          targetId: c.targetId,
          beforeSnapshot: c.beforeSnapshot ?? null,
          afterSnapshot: c.afterSnapshot ?? null,
        })),
      });
      clearChangesWithoutHistory();
      // PRD-I (M4): 확정(committed) 상태로 전환 — 라이프사이클 표시용.
      markCommitted();
      // PRD-E P2-2: 커밋 후 임베딩 생성 트리거 (논블로킹).
      // PRD-J M2: 브랜치 엔티티는 Supabase 에 없으므로 브랜치 모드에선 스킵.
      if (!currentBranch) {
        void embeddingsApi.process().catch(() => {});
      }
      toast.success('저장 완료', {
        description: currentBranch
          ? `'${currentBranch.name}' 브랜치에 저장되었습니다.`
          : '변경사항이 Supabase에 저장되었습니다.',
      });
    } catch {
      toast.error('저장 실패', { description: '다시 시도해주세요.' });
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="h-[38px] min-h-[38px] flex items-center justify-between px-3 border-t border-border bg-card/80 backdrop-blur-sm" data-testid="commit-bar">
      <div className="flex items-center gap-2">
        <AutoSaveIndicator
          state={autoSaveState}
          autoEnabled={autoSaveEnabled}
          onToggleAuto={toggleAutoSave}
        />
        <Badge
          variant="outline"
          className={
            currentBranch
              ? 'h-5 text-[11px] px-1.5 shrink-0 text-sky-700 border-sky-400/50 bg-sky-50 dark:text-sky-400 dark:bg-sky-900/30'
              : 'h-5 text-[11px] px-1.5 shrink-0 text-muted-foreground'
          }
          title={
            currentBranch
              ? `'${currentBranch.name}' 브랜치에서 작업 중입니다. 저장은 브랜치 커밋으로 기록되고, main 병합 후에만 운영(Neo4j)에 발행할 수 있습니다.`
              : '지금 편집 내용은 스테이징(초안)에 있습니다. ‘저장’은 스테이징 보관, ‘반영’은 운영(Neo4j)으로 발행입니다.'
          }
          data-testid="staging-badge"
        >
          {currentBranch ? `브랜치: ${currentBranch.name}` : '스테이징(초안)'}
        </Badge>
        <LifecycleIndicator
          onOpenChanges={() => setShowChanges(true)}
          onPublish={() => setShowNeoPush(true)}
        />
        <span className="text-xs text-foreground">
          변경사항 {pendingChanges.length}건
        </span>
        {unpushedCount > 0 && (
          <Badge
            variant="outline"
            className="h-5 text-[11px] px-1.5 shrink-0 text-amber-600 border-amber-500/40"
            title="스테이징에는 저장됐지만 아직 Neo4j(운영 반영본)로 발행되지 않은 커밋입니다. ‘반영’을 눌러 반영본을 채우세요. (자동 발행 아님)"
          >
            미반영 {unpushedCount}건
          </Badge>
        )}
        {hasChanges && (
          <span className="text-[11px] font-mono flex items-center gap-1.5">
            {opCounts.ADD > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400">+{opCounts.ADD}</span>
            )}
            {opCounts.MOD > 0 && (
              <span className="text-amber-600 dark:text-amber-400">~{opCounts.MOD}</span>
            )}
            {opCounts.DEL > 0 && (
              <span className="text-red-600 dark:text-red-400">-{opCounts.DEL}</span>
            )}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs px-2 gap-1"
          disabled={!hasChanges}
          onClick={() => undo()}
          title="마지막 변경 되돌리기 (Ctrl+Z)"
        >
          <Undo2 className="w-3 h-3" />
          되돌리기
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs px-2 gap-1"
          disabled={!hasChanges}
          onClick={() => setShowChanges(true)}
        >
          <List className="w-3 h-3" />
          변경 내역
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs px-2 gap-1"
          onClick={() => setShowHistory(true)}
          title="커밋 히스토리"
        >
          <History className="w-3 h-3" />
          히스토리
        </Button>
        {!autoSaveEnabled && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs px-2.5 gap-1"
            disabled={!hasChanges || isCommitting}
            onClick={handleCommit}
            data-testid="commit-btn"
            title="스테이징에 저장 — Supabase에 변경 이력으로 보관합니다(아직 운영 반영은 아님)."
          >
            {isCommitting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <GitCommitHorizontal className="w-3 h-3" />
            )}
            {isCommitting ? '저장 중...' : '저장'}
          </Button>
        )}
        <Button
          size="sm"
          className="h-8 text-xs px-2.5 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={!canPublish || !!currentBranch}
          onClick={() => setShowNeoPush(true)}
          data-testid="neo4j-push-btn"
          title={
            currentBranch
              ? '브랜치에서는 발행할 수 없습니다. main 으로 병합한 뒤 발행하세요.'
              : '운영(반영본)에 발행 — Neo4j 그래프로 내보냅니다. 자동 발행이 아니므로 직접 눌러야 반영됩니다.'
          }
        >
          <ArrowUpCircle className="w-3 h-3" />
          반영{!hasChanges && unpushedCount > 0 ? ` (미반영 ${unpushedCount})` : ''}
        </Button>
      </div>

      {/* Change history sheet */}
      <Sheet open={showChanges} onOpenChange={setShowChanges}>
        <SheetContent side="bottom" className="h-[50vh]">
          <SheetHeader>
            <SheetTitle className="text-sm">변경 내역 ({pendingChanges.length}건)</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-full mt-3">
            <div className="space-y-1 pr-4">
              {pendingChanges.map((change) => {
                const opStyle = OP_STYLES[change.operation] ?? OP_STYLES.ADD;
                return (
                  <div key={change.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 transition-colors">
                    <Badge variant="outline" className={`h-5 text-[11px] px-1.5 font-mono shrink-0 ${opStyle.className}`}>
                      {opStyle.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono shrink-0">{change.targetTable}</span>
                    <span className="text-xs text-foreground truncate">{change.targetName}</span>
                    <span className="text-[11px] text-muted-foreground/60 ml-auto shrink-0">
                      {new Date(change.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                );
              })}
              {pendingChanges.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">변경 내역이 없습니다</p>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Neo4j push confirmation sheet */}
      <NeoConfirmSheet open={showNeoPush} onOpenChange={setShowNeoPush} />

      {/* Commit history panel */}
      <CommitHistoryPanel open={showHistory} onOpenChange={setShowHistory} />
    </div>
  );
}
