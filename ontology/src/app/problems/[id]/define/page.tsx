'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Boxes, LinkIcon, GitMerge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ProblemDefineForm from '@/features/problems/components/ProblemDefineForm';
import StageConfirmBar from '@/features/problems/components/StageConfirmBar';
import { useProblemWorkflowStore } from '@/features/problems/hooks/useProblemWorkflowStore';

const MODE_LABEL: Record<string, string> = {
  new: '새로 만듦',
  reuse: '재사용',
  extend: '확장',
  branch: '분기',
};

export default function DefinePage() {
  const params = useParams<{ id: string }>();
  const detail = useProblemWorkflowStore((s) => s.detail);
  if (!detail) return null;

  return (
    <div className="p-6 space-y-6">
      <ProblemDefineForm initial={detail} />

      <div className="max-w-2xl mx-auto w-full space-y-3">
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <LinkIcon className="w-4 h-4 text-primary" /> 연결된 온톨로지
          </div>
          {detail.links.length === 0 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">아직 온톨로지에 연결되지 않았습니다.</p>
              <Button asChild size="sm">
                <Link href={`/problems/${params.id}/ontology-link`}>온톨로지 연결</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {detail.links.map((l) => (
                <div key={l.id} className="flex items-center gap-2 text-sm">
                  <Boxes className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate">{l.ontologyName ?? l.ontologyId}</span>
                  <Badge variant="outline" className="text-[10px]">{MODE_LABEL[l.linkMode] ?? l.linkMode}</Badge>
                  {l.isPrimary && <Badge variant="secondary" className="text-[10px]">주</Badge>}
                  {l.linkMode === 'branch' && (
                    <Button asChild size="sm" variant="ghost" className="h-6 gap-1 ml-auto text-xs">
                      <Link href={`/problems/${params.id}/studio?merge=1`} title="이 분기의 병합 요청">
                        <GitMerge className="w-3.5 h-3.5" /> 병합 요청
                      </Link>
                    </Button>
                  )}
                </div>
              ))}
              <Button asChild variant="ghost" size="sm" className="mt-1">
                <Link href={`/problems/${params.id}/ontology-link`}>온톨로지 다시 연결</Link>
              </Button>
            </div>
          )}
        </div>

        <StageConfirmBar problemId={params.id} step="define" />
      </div>
    </div>
  );
}
