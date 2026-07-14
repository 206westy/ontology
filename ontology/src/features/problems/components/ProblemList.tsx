'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Boxes, AlertTriangle, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { problemsApi, type ProblemListItem } from '../api';

const STATUS_LABEL: Record<string, string> = {
  defining: '정의 중',
  in_progress: '진행 중',
  completed: '완료',
  archived: '보관',
};

function hasStale(item: ProblemListItem): boolean {
  return Object.values(item.workflowState ?? {}).some((s) => s?.state === 'stale');
}

// PRD-PF-C M1: 문제 목록(문제-우선 진입점). 카드=문제명·상태·귀속 온톨로지·최근 활동.
export default function ProblemList() {
  const [items, setItems] = useState<ProblemListItem[] | null>(null);

  useEffect(() => {
    problemsApi.list().then(setItems).catch(() => setItems([]));
  }, []);

  return (
    <div className="max-w-3xl mx-auto w-full py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">문제</h1>
          <p className="text-sm text-muted-foreground">
            무슨 문제를 푸는지 정의하고, 데이터·온톨로지·결정함수·보드로 단계별 확정하며 해결합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/platform"><ArrowLeft className="w-4 h-4 mr-1.5" /> 런처</Link>
          </Button>
          <Button asChild>
            <Link href="/problems/new"><Plus className="w-4 h-4 mr-1.5" /> 새 문제</Link>
          </Button>
        </div>
      </div>

      {items === null ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center space-y-3">
          <p className="text-sm text-muted-foreground">아직 정의된 문제가 없습니다.</p>
          <Button asChild>
            <Link href="/problems/new"><Plus className="w-4 h-4 mr-1.5" /> 첫 문제 정의하기</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <Link
              key={p.id}
              href={`/problems/${p.id}/define`}
              className="block rounded-lg border border-border bg-card px-4 py-3 hover:border-primary/40 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{p.title}</span>
                    {hasStale(p) && (
                      <Badge variant="outline" className="text-[10px] gap-1 border-amber-500 text-amber-600">
                        <AlertTriangle className="w-3 h-3" /> 재검토
                      </Badge>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{p.description}</p>
                  )}
                  {p.primaryOntologyName && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Boxes className="w-3 h-3" /> {p.primaryOntologyName}
                    </div>
                  )}
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {STATUS_LABEL[p.status] ?? p.status}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
