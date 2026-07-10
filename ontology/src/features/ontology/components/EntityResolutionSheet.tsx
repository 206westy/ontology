'use client';

import { useState, useEffect, useCallback } from 'react';
import { GitMerge, Loader2, CheckCircle2 } from 'lucide-react';
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
import { entityResolutionApi, type MergeCandidate } from '../api';
import CandidatePairCard, { type NodeStats } from './er/CandidatePairCard';

export default function EntityResolutionSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  const mergeEntities = useOntologyStore((s) => s.mergeEntities);
  const focusNode = useOntologyStore((s) => s.focusNode);

  const load = useCallback(() => {
    setLoading(true);
    entityResolutionApi
      .candidates()
      .then((res) => setCandidates(res.candidates))
      .catch((err) => toast.error(err instanceof Error ? err.message : '중복 후보를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const statsFor = useCallback((id: string, kind: 'class' | 'instance'): NodeStats => {
    const { edges, properties, instances } = useOntologyStore.getState();
    return {
      edges: edges.filter((e) => e.sourceId === id || e.targetId === id).length,
      properties: kind === 'class' ? properties.filter((p) => p.classId === id).length : 0,
      instances: kind === 'class' ? instances.filter((i) => i.classId === id).length : 0,
    };
  }, []);

  const suggestedSurvivor = useCallback(
    (c: MergeCandidate): 'a' | 'b' => {
      const wa = statsFor(c.a.id, c.kind);
      const wb = statsFor(c.b.id, c.kind);
      const weight = (s: NodeStats) => s.edges + s.instances + s.properties;
      return weight(wb) > weight(wa) ? 'b' : 'a';
    },
    [statsFor],
  );

  const removeCandidate = useCallback((pairId: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== pairId));
  }, []);

  const handleMerge = useCallback(
    (candidate: MergeCandidate, survivorId: string, mergedId: string) => {
      const mergedStats = statsFor(mergedId, candidate.kind);
      const result = mergeEntities(survivorId, mergedId, candidate.kind);
      if (!result.ok) {
        toast.error(result.reason ?? '병합에 실패했습니다.');
        return;
      }
      removeCandidate(candidate.id);
      focusNode(survivorId);
      const impact =
        candidate.kind === 'class'
          ? `엣지 ${mergedStats.edges} 재연결, 프로퍼티 ${mergedStats.properties} 이관, 인스턴스 ${mergedStats.instances} 이동`
          : `엣지 ${mergedStats.edges} 재연결`;
      toast.success(`병합 완료 — ${impact}`);
    },
    [mergeEntities, removeCandidate, focusNode, statsFor],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <GitMerge className="w-4 h-4 text-primary" />
            중복 검사 / 병합
          </SheetTitle>
          <SheetDescription className="text-xs">
            이름이 같거나 유사한 항목을 검토하고 병합합니다. 병합은 변경사항으로 기록되어 커밋·반영 시 Neo4j에 정합됩니다.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between py-2">
          <span className="text-xs text-muted-foreground">
            후보 {candidates.length}건
          </span>
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : '새로고침'}
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0 -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="w-8 h-8 text-success/70 mb-2" />
              <p className="text-xs text-muted-foreground">중복 후보가 없습니다</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                이름이 유사한 클래스/인스턴스가 발견되지 않았습니다.
              </p>
            </div>
          ) : (
            <div className="space-y-2 pb-4">
              {candidates.map((c) => (
                <CandidatePairCard
                  key={c.id}
                  candidate={c}
                  statsA={statsFor(c.a.id, c.kind)}
                  statsB={statsFor(c.b.id, c.kind)}
                  suggested={suggestedSurvivor(c)}
                  onMerge={(survivorId, mergedId) => handleMerge(c, survivorId, mergedId)}
                  onDismiss={(reason) => {
                    removeCandidate(c.id);
                    if (reason === 'distinct') toast.info('별개 항목으로 표시했습니다.');
                  }}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
