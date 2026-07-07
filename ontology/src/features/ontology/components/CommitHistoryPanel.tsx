'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  History,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  GitCommitHorizontal,
  Bot,
  User,
  GitBranch,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { commitsApi } from '../api';
import type { Commit, CommitDetail, ChangeOperation } from '../lib/types';

interface CommitWithDetails extends Commit {
  details: CommitDetail[];
}

const OP_META: Record<ChangeOperation, { icon: typeof Plus; label: string; className: string }> = {
  ADD: {
    icon: Plus,
    label: '생성',
    className: 'text-emerald-600 dark:text-emerald-400',
  },
  MOD: {
    icon: Pencil,
    label: '수정',
    className: 'text-amber-600 dark:text-amber-400',
  },
  DEL: {
    icon: Trash2,
    label: '삭제',
    className: 'text-red-600 dark:text-red-400',
  },
};

const TABLE_LABELS: Record<string, string> = {
  classes: '클래스',
  instances: '인스턴스',
  properties: '프로퍼티',
  edges: '관계',
  relation_types: '관계 유형',
  axioms: '공리',
  instance_values: '인스턴스 값',
  constraints: '제약조건',
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHr < 24) return `${diffHr}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;

  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatFullTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function CommitDetailRow({ detail }: { detail: CommitDetail }) {
  const meta = OP_META[detail.operation] ?? OP_META.ADD;
  const Icon = meta.icon;
  const tableLabel = TABLE_LABELS[detail.targetTable] ?? detail.targetTable;

  const targetName = useMemo(() => {
    const snapshot = detail.afterSnapshot ?? detail.beforeSnapshot;
    if (snapshot && typeof snapshot === 'object' && 'name' in snapshot) {
      return (snapshot as Record<string, unknown>).name as string;
    }
    return detail.targetId.slice(0, 8);
  }, [detail]);

  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 transition-colors">
      <Icon className={`w-3 h-3 shrink-0 ${meta.className}`} />
      <span className="text-[10px] text-muted-foreground font-mono shrink-0">{tableLabel}</span>
      <span className="text-xs text-foreground truncate">{targetName}</span>
    </div>
  );
}

interface CommitHistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CommitHistoryPanel({ open, onOpenChange }: CommitHistoryPanelProps) {
  const [commitList, setCommitList] = useState<CommitWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    commitsApi
      .list()
      .then((data) => {
        if (!cancelled) {
          setCommitList(data as CommitWithDetails[]);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '커밋 목록을 불러올 수 없습니다');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const dateGroups = useMemo(() => {
    const groups = new Map<string, CommitWithDetails[]>();

    for (const commit of commitList) {
      const dateKey = new Date(commit.createdAt).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const existing = groups.get(dateKey) ?? [];
      existing.push(commit);
      groups.set(dateKey, existing);
    }

    return Array.from(groups.entries());
  }, [commitList]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-sm flex items-center gap-2">
            <History className="w-4 h-4" />
            커밋 히스토리
          </SheetTitle>
          <SheetDescription className="text-xs">
            온톨로지 변경 이력을 확인합니다.
          </SheetDescription>
        </SheetHeader>

        {/* Stats */}
        {!isLoading && !error && commitList.length > 0 && (
          <div className="flex items-center gap-3 py-2 px-1 border-b border-border">
            <span className="text-xs text-muted-foreground">
              최근 {commitList.length}건
            </span>
            <span className="text-[10px] text-muted-foreground">
              수동 {commitList.filter((c) => !c.isAutoSave).length} / 자동 {commitList.filter((c) => c.isAutoSave).length}
            </span>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">히스토리 불러오는 중...</span>
            </div>
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && commitList.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-center">
              <GitCommitHorizontal className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">커밋 기록이 없습니다.</p>
            </div>
          </div>
        )}

        {/* Commit list */}
        {!isLoading && !error && commitList.length > 0 && (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4 pb-4">
              {dateGroups.map(([dateLabel, commits]) => (
                <div key={dateLabel}>
                  <div className="sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-1.5">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      {dateLabel}
                    </span>
                  </div>
                  <Accordion type="multiple" className="w-full">
                    {commits.map((commit) => {
                      const detailCount = commit.details?.length ?? 0;
                      return (
                        <AccordionItem key={commit.id} value={commit.id} className="border-b-0">
                          <AccordionTrigger className="py-2 text-xs hover:no-underline">
                            <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                              <GitCommitHorizontal className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate text-foreground font-normal">
                                {commit.message}
                              </span>
                              {commit.isAutoSave && (
                                <Badge
                                  variant="outline"
                                  className="h-4 text-[9px] px-1 font-mono shrink-0 bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/40 dark:text-violet-400 dark:border-violet-700"
                                >
                                  <Bot className="w-2.5 h-2.5 mr-0.5" />
                                  Auto
                                </Badge>
                              )}
                              {commit.branchId && (
                                <Badge
                                  variant="outline"
                                  className="h-4 text-[9px] px-1 font-mono shrink-0 bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/40 dark:text-sky-400 dark:border-sky-700"
                                  title="브랜치 커밋 (main 미적용, 병합으로 반영)"
                                >
                                  <GitBranch className="w-2.5 h-2.5" />
                                </Badge>
                              )}
                              {detailCount > 0 && (
                                <Badge variant="secondary" className="h-4 text-[9px] px-1 font-mono shrink-0">
                                  {detailCount}
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                                {formatTime(commit.createdAt)}
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pb-2 pt-0">
                            <div className="ml-5 space-y-0.5">
                              <div className="text-[10px] text-muted-foreground mb-1.5 flex items-center flex-wrap gap-x-2">
                                {formatFullTime(commit.createdAt)}
                                {commit.authorEmail && (
                                  <span className="inline-flex items-center gap-0.5" title={`작성자: ${commit.authorEmail}`}>
                                    <User className="w-2.5 h-2.5" />
                                    {commit.authorEmail.split('@')[0]}
                                  </span>
                                )}
                                {commit.pushedToNeo4j && (
                                  <Badge variant="outline" className="h-3.5 text-[8px] px-1 ml-2 bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-700">
                                    Neo4j 반영됨
                                  </Badge>
                                )}
                              </div>
                              {commit.details && commit.details.length > 0 ? (
                                commit.details.map((detail) => (
                                  <CommitDetailRow key={detail.id} detail={detail} />
                                ))
                              ) : (
                                <p className="text-[10px] text-muted-foreground py-1">변경 상세 정보 없음</p>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
