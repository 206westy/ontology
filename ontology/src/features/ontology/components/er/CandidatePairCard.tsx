'use client';

import { ArrowLeft, ArrowRight, SplitSquareHorizontal, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

  return (
    <div className="rounded-md border border-border bg-card p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className="h-4 text-[9px] px-1">
          {kind === 'class' ? '클래스' : '인스턴스'}
        </Badge>
        <span className="text-[10px] text-muted-foreground">{Math.round(score * 100)}% 유사</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
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

      <p className="text-[10px] text-muted-foreground">{reason}</p>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] px-1.5 gap-0.5 flex-1"
          onClick={() => onMerge(a.id, b.id)}
          title={`"${b.name}"을 "${a.name}"에 병합`}
        >
          <ArrowLeft className="w-3 h-3" />
          병합
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] px-1.5 gap-0.5 flex-1"
          onClick={() => onMerge(b.id, a.id)}
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
    </div>
  );
}
