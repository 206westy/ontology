'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GitPullRequest,
  GitMerge,
  Check,
  X,
  ArrowLeft,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ShieldAlert,
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { useBranchActions, BRANCHES_KEY } from '../hooks/useBranches';
import {
  mergeRequestsApi,
  type MergeRequestRow,
  type MergeRequestDetail,
  type MergeNetChange,
} from '../api';

// PRD-J M3: 머지 리퀘스트 패널 — 목록/생성/리뷰/충돌 해소/병합.
// 변경 요약은 CommitBar 변경내역·CommitHistoryPanel 과 같은 시각 문법(±~)을 재사용한다.

const MR_KEY = ['merge-requests'] as const;

const STATUS_META: Record<
  MergeRequestRow['status'],
  { label: string; className: string }
> = {
  open: { label: '열림', className: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/40 dark:text-sky-400' },
  approved: { label: '승인됨', className: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-400' },
  merged: { label: '병합됨', className: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/40 dark:text-violet-400' },
  closed: { label: '닫힘', className: 'bg-muted text-muted-foreground' },
};

const OP_META = {
  ADD: { icon: Plus, className: 'text-emerald-600 dark:text-emerald-400' },
  MOD: { icon: Pencil, className: 'text-amber-600 dark:text-amber-400' },
  DEL: { icon: Trash2, className: 'text-red-600 dark:text-red-400' },
} as const;

const TABLE_LABELS: Record<string, string> = {
  classes: '클래스',
  instances: '인스턴스',
  properties: '프로퍼티',
  edges: '관계',
  relation_types: '관계 유형',
  // 과거 브랜치 커밋의 axioms detail 표시용(하위호환) — 현행은 constraints 단일 규칙.
  axioms: '규칙(설명 메모)',
  instance_values: '인스턴스 값',
};

const REASON_LABELS: Record<string, string> = {
  'mod-mod': '양쪽에서 수정됨',
  'mod-del': '브랜치는 수정, main은 삭제',
  'del-mod': '브랜치는 삭제, main은 수정',
  'add-add': '양쪽에서 같은 ID로 생성됨',
};

function changeName(c: MergeNetChange): string {
  const snap = c.afterSnapshot ?? c.beforeSnapshot;
  const name = snap && (snap as { name?: unknown }).name;
  return typeof name === 'string' && name ? name : c.targetId.slice(0, 8);
}

function ChangeRow({ change }: { change: MergeNetChange }) {
  const meta = OP_META[change.operation] ?? OP_META.ADD;
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-2 py-0.5 px-2 rounded hover:bg-muted/50">
      <Icon className={`w-3 h-3 shrink-0 ${meta.className}`} />
      <span className="text-[10px] text-muted-foreground font-mono shrink-0">
        {TABLE_LABELS[change.targetTable] ?? change.targetTable}
      </span>
      <span className="text-xs truncate">{changeName(change)}</span>
    </div>
  );
}

interface MergeRequestSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MergeRequestSheet({ open, onOpenChange }: MergeRequestSheetProps) {
  const qc = useQueryClient();
  const currentBranch = useOntologyStore((s) => s.currentBranch);
  const { checkoutMain } = useBranchActions();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  // 충돌 해소 선택: key → mine/theirs
  const [choices, setChoices] = useState<Record<string, 'mine' | 'theirs'>>({});

  const listQuery = useQuery({
    queryKey: [...MR_KEY],
    queryFn: () => mergeRequestsApi.list(),
    enabled: open,
  });

  const detailQuery = useQuery({
    queryKey: [...MR_KEY, selectedId],
    queryFn: () => mergeRequestsApi.get(selectedId!),
    enabled: open && !!selectedId,
  });

  const detail: MergeRequestDetail | undefined = detailQuery.data;
  const unresolvedCount = useMemo(() => {
    if (!detail) return 0;
    return detail.plan.conflicts.filter((c) => !choices[c.key]).length;
  }, [detail, choices]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [...MR_KEY] });
    qc.invalidateQueries({ queryKey: [...BRANCHES_KEY] });
  };

  const handleCreate = async () => {
    if (!currentBranch || !newTitle.trim()) return;
    setIsBusy(true);
    try {
      const mr = await mergeRequestsApi.create({
        branchId: currentBranch.id,
        title: newTitle.trim(),
      });
      setNewTitle('');
      refresh();
      setSelectedId(mr.id);
      toast.success('병합 요청을 만들었습니다');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '병합 요청 생성 실패');
    } finally {
      setIsBusy(false);
    }
  };

  const handleReview = async (status: 'approved' | 'closed') => {
    if (!selectedId) return;
    setIsBusy(true);
    try {
      await mergeRequestsApi.review(selectedId, status);
      refresh();
      qc.invalidateQueries({ queryKey: [...MR_KEY, selectedId] });
      toast.success(status === 'approved' ? '승인했습니다' : '닫았습니다');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '상태 변경 실패');
    } finally {
      setIsBusy(false);
    }
  };

  const handleMerge = async () => {
    if (!selectedId || !detail) return;
    setIsBusy(true);
    try {
      const resolutions = detail.plan.conflicts
        .filter((c) => choices[c.key])
        .map((c) => ({ key: c.key, choice: choices[c.key] }));
      const result = await mergeRequestsApi.merge(selectedId, resolutions);
      toast.success('병합 완료', {
        description: `${result.applied}건이 main에 적용되었습니다. '반영'으로 Neo4j에 발행하세요.`,
      });
      setChoices({});
      refresh();
      qc.invalidateQueries({ queryKey: [...MR_KEY, selectedId] });
      qc.invalidateQueries({ queryKey: ['commits'] });
      // 병합된 브랜치에 있었다면 main 으로 복귀시켜 최신 상태를 보게 한다.
      if (currentBranch && currentBranch.id === detail.branch.id) {
        await checkoutMain();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '병합 실패', {
        description: '충돌이 남아 있거나 서버 오류입니다. 계획을 새로고침해 다시 시도하세요.',
      });
      qc.invalidateQueries({ queryKey: [...MR_KEY, selectedId] });
    } finally {
      setIsBusy(false);
    }
  };

  const mrList = listQuery.data ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-sm flex items-center gap-2">
            <GitPullRequest className="w-4 h-4" />
            병합 요청
          </SheetTitle>
          <SheetDescription className="text-xs">
            브랜치의 변경을 검토하고 main으로 병합합니다.
          </SheetDescription>
        </SheetHeader>

        {/* 목록 화면 */}
        {!selectedId && (
          <>
            {currentBranch && (
              <div className="flex items-center gap-1.5 py-2 border-b border-border">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={`'${currentBranch.name}' 병합 요청 제목`}
                  className="h-7 text-xs"
                  data-testid="mr-title-input"
                />
                <Button
                  size="sm"
                  className="h-7 px-2 shrink-0"
                  disabled={!newTitle.trim() || isBusy}
                  onClick={handleCreate}
                  data-testid="mr-create-btn"
                >
                  <GitPullRequest className="w-3.5 h-3.5 mr-1" />
                  요청
                </Button>
              </div>
            )}

            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-1 py-2">
                {listQuery.isLoading && (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!listQuery.isLoading && mrList.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    병합 요청이 없습니다.
                    {!currentBranch && ' 브랜치에서 작업한 뒤 여기서 병합을 요청하세요.'}
                  </p>
                )}
                {mrList.map((mr) => {
                  const meta = STATUS_META[mr.status];
                  return (
                    <button
                      key={mr.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(mr.id);
                        setChoices({});
                      }}
                      className="w-full flex items-center gap-2 px-2 py-2 text-left rounded-md hover:bg-muted"
                    >
                      <GitPullRequest className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate">{mr.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {mr.branch?.name ?? mr.branchId.slice(0, 8)}
                          {mr.authorEmail ? ` · ${mr.authorEmail.split('@')[0]}` : ''}
                        </p>
                      </div>
                      <Badge variant="outline" className={`h-4 text-[9px] px-1 shrink-0 ${meta.className}`}>
                        {meta.label}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        )}

        {/* 상세 화면 */}
        {selectedId && (
          <>
            <div className="flex items-center gap-2 py-1.5 border-b border-border">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5"
                onClick={() => setSelectedId(null)}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </Button>
              {detail && (
                <>
                  <span className="text-xs font-medium truncate flex-1">
                    {detail.mergeRequest.title}
                  </span>
                  <Badge
                    variant="outline"
                    className={`h-4 text-[9px] px-1 shrink-0 ${STATUS_META[detail.mergeRequest.status].className}`}
                  >
                    {STATUS_META[detail.mergeRequest.status].label}
                  </Badge>
                </>
              )}
            </div>

            {detailQuery.isLoading && (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {detail && (
              <>
                <ScrollArea className="flex-1 -mx-6 px-6">
                  <div className="space-y-3 py-2">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>브랜치 변경 {detail.stats.mine}건</span>
                      <span>·</span>
                      <span>자동 적용 {detail.stats.autoApply}건</span>
                      <span>·</span>
                      <span className={detail.stats.conflicts > 0 ? 'text-red-500 font-medium' : ''}>
                        충돌 {detail.stats.conflicts}건
                      </span>
                      {detail.stats.identical > 0 && (
                        <>
                          <span>·</span>
                          <span>동일 {detail.stats.identical}건</span>
                        </>
                      )}
                    </div>

                    {/* 자동 적용 목록 */}
                    {detail.plan.autoApply.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                          자동 적용
                        </p>
                        <div className="space-y-0.5">
                          {detail.plan.autoApply.map((c) => (
                            <ChangeRow key={c.key} change={c} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 충돌 목록 + 해소 */}
                    {detail.plan.conflicts.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-red-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3" />
                          충돌 — 항목별로 선택하세요
                        </p>
                        <div className="space-y-2">
                          {detail.plan.conflicts.map((c) => (
                            <div key={c.key} className="border border-red-300/50 dark:border-red-800/50 rounded-md p-2 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium truncate">{c.targetName}</span>
                                <span className="text-[9px] text-muted-foreground font-mono">
                                  {TABLE_LABELS[c.targetTable] ?? c.targetTable}
                                </span>
                                <Badge variant="outline" className="h-4 text-[9px] px-1 ml-auto text-red-600 border-red-400/50">
                                  {REASON_LABELS[c.reason] ?? c.reason}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setChoices((p) => ({ ...p, [c.key]: 'mine' }))}
                                  className={`text-left rounded border p-1.5 text-[10px] transition-colors ${
                                    choices[c.key] === 'mine'
                                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/30'
                                      : 'border-border hover:bg-muted/50'
                                  }`}
                                >
                                  <span className="font-medium block mb-0.5">
                                    브랜치 ({c.mine.operation})
                                  </span>
                                  <span className="text-muted-foreground line-clamp-2">
                                    {c.mine.afterSnapshot
                                      ? JSON.stringify(c.mine.afterSnapshot?.name ?? c.mine.afterSnapshot).slice(0, 60)
                                      : '삭제'}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setChoices((p) => ({ ...p, [c.key]: 'theirs' }))}
                                  className={`text-left rounded border p-1.5 text-[10px] transition-colors ${
                                    choices[c.key] === 'theirs'
                                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
                                      : 'border-border hover:bg-muted/50'
                                  }`}
                                >
                                  <span className="font-medium block mb-0.5">
                                    main ({c.theirs.operation})
                                  </span>
                                  <span className="text-muted-foreground line-clamp-2">
                                    {c.theirs.afterSnapshot
                                      ? JSON.stringify(c.theirs.afterSnapshot?.name ?? c.theirs.afterSnapshot).slice(0, 60)
                                      : '삭제'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* 액션 바 */}
                {(detail.mergeRequest.status === 'open' ||
                  detail.mergeRequest.status === 'approved') && (
                  <div className="flex items-center gap-1.5 pt-2 border-t border-border">
                    {detail.mergeRequest.status === 'open' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] gap-1"
                        disabled={isBusy}
                        onClick={() => handleReview('approved')}
                        data-testid="mr-approve-btn"
                      >
                        <Check className="w-3 h-3" />
                        승인
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] gap-1 text-muted-foreground"
                      disabled={isBusy}
                      onClick={() => handleReview('closed')}
                    >
                      <X className="w-3 h-3" />
                      닫기
                    </Button>
                    <div className="flex-1" />
                    <Button
                      size="sm"
                      className="h-7 text-[11px] gap-1 bg-violet-600 hover:bg-violet-700 text-white"
                      disabled={isBusy || unresolvedCount > 0}
                      onClick={handleMerge}
                      title={
                        unresolvedCount > 0
                          ? `충돌 ${unresolvedCount}건을 먼저 해소하세요`
                          : 'main으로 병합'
                      }
                      data-testid="mr-merge-btn"
                    >
                      {isBusy ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <GitMerge className="w-3 h-3" />
                      )}
                      병합{unresolvedCount > 0 ? ` (충돌 ${unresolvedCount})` : ''}
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
