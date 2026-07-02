'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, SplitSquareHorizontal, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmCard } from '@/components/ui/confirm-card';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import type { MergeCandidate } from '../../api';

export interface NodeStats {
  edges: number;
  properties: number;
  instances: number;
}

function statLine(kind: 'class' | 'instance', s: NodeStats): string {
  return kind === 'class'
    ? `엣지 ${s.edges} · 프로퍼티 ${s.properties} · 인스턴스 ${s.instances}`
    : `엣지 ${s.edges}`;
}

// PRD-I §3: 공통 ConfirmCard 껍데기로 재정규화(판정→근거→미리보기→액션).
// 병합 후보. 판정=중복 가능. 병합은 즉시 실행하지 않고 방향·이동 대상·되돌리기 안내를 먼저 확인시킨다.
export default function CandidatePairCard({
  candidate,
  statsA,
  statsB,
  suggested,
  onMerge,
  onDismiss,
}: {
  candidate: MergeCandidate;
  statsA: NodeStats;
  statsB: NodeStats;
  suggested: 'a' | 'b';
  // survivorId, mergedId
  onMerge: (survivorId: string, mergedId: string) => void;
  onDismiss: (reason: 'distinct' | 'skip') => void;
}) {
  const { a, b, kind, reason, score } = candidate;

  // 병합은 즉시 실행하지 않고, 방향·이동 대상·되돌리기 안내를 먼저 확인시킨다.
  const [pending, setPending] = useState<{
    survivorId: string;
    mergedId: string;
    survivorName: string;
    mergedName: string;
    mergedStats: NodeStats;
  } | null>(null);

  const preview = (
    <>
      <p className="text-[10px] text-muted-foreground">{Math.round(score * 100)}% 유사</p>

      <div className="mt-1.5 grid grid-cols-2 gap-2">
        {(['a', 'b'] as const).map((side) => {
          const node = side === 'a' ? a : b;
          const stats = side === 'a' ? statsA : statsB;
          const isSuggested = suggested === side;
          return (
            <div
              key={side}
              className={`rounded border p-1.5 ${isSuggested ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border'}`}
            >
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-medium text-foreground truncate">{node.name}</span>
                {isSuggested && (
                  <Badge variant="outline" className="h-3.5 text-[8px] px-1 text-emerald-600 border-emerald-500/40 shrink-0">
                    추천 유지
                  </Badge>
                )}
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5">{statLine(kind, stats)}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-1.5 text-[10px] text-muted-foreground">{reason}</p>
    </>
  );

  const actions = (
    <div className="flex w-full items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-[10px] px-1.5 gap-0.5 flex-1"
        onClick={() => setPending({ survivorId: a.id, mergedId: b.id, survivorName: a.name, mergedName: b.name, mergedStats: statsB })}
        title={`"${b.name}"을 "${a.name}"에 병합`}
      >
        <ArrowLeft className="w-3 h-3" />
        병합
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-[10px] px-1.5 gap-0.5 flex-1"
        onClick={() => setPending({ survivorId: b.id, mergedId: a.id, survivorName: b.name, mergedName: a.name, mergedStats: statsA })}
        title={`"${a.name}"을 "${b.name}"에 병합`}
      >
        병합
        <ArrowRight className="w-3 h-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-[10px] px-1.5 gap-0.5"
        onClick={() => onDismiss('distinct')}
        title="별개 항목으로 표시"
      >
        <SplitSquareHorizontal className="w-3 h-3" />
        별개
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={() => onDismiss('skip')}
        title="건너뛰기"
      >
        <SkipForward className="w-3 h-3" />
      </Button>
    </div>
  );

  return (
    <>
      <ConfirmCard
        eyebrow={kind === 'class' ? '클래스' : '인스턴스'}
        verdict="possible_duplicate"
        title={
          <>
            {a.name} ↔ {b.name}
          </>
        }
        preview={preview}
        actions={actions}
      />

      <AlertDialog open={!!pending} onOpenChange={(open) => { if (!open) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>병합 확인</AlertDialogTitle>
            <AlertDialogDescription>
              {pending && (
                <>
                  <span className="font-medium text-foreground">&ldquo;{pending.mergedName}&rdquo;</span>
                  {'을(를) '}
                  <span className="font-medium text-foreground">&ldquo;{pending.survivorName}&rdquo;</span>
                  {'에 병합합니다. '}
                  &ldquo;{pending.mergedName}&rdquo;는 사라지고, 아래 항목이 &ldquo;{pending.survivorName}&rdquo;로 재연결·이관됩니다(중복은 자동 정리).
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pending && (
            <div className="rounded-md bg-muted/40 px-2.5 py-2 text-xs text-foreground">
              {statLine(kind, pending.mergedStats)}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">되돌리려면 Ctrl+Z 를 누르세요.</p>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) onMerge(pending.survivorId, pending.mergedId);
                setPending(null);
              }}
            >
              병합
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
