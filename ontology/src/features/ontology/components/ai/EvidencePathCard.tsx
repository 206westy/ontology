'use client';

import { Route, FileText, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { RagAnswerResult } from '../../api';

interface EvidencePathCardProps {
  evidence: RagAnswerResult;
  onHighlight: (nodeIds: string[]) => void;
}

// PRD-N M4: 진단형 RAG 답변의 근거경로·출처·근거없음 렌더. 경로 클릭 → 캔버스 하이라이트.
export default function EvidencePathCard({ evidence, onHighlight }: EvidencePathCardProps) {
  const { paths, sources, ungroundedNote } = evidence;
  if (paths.length === 0 && !ungroundedNote) return null;

  return (
    <div
      className="mt-2 space-y-1.5 rounded-md border border-border bg-muted/30 p-2 text-xs"
      data-testid="evidence-paths"
    >
      {paths.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Route className="h-3 w-3" /> 근거경로 {paths.length}
          </div>
          {paths.map((p, i) => (
            <button
              key={i}
              type="button"
              className="block w-full rounded border border-border/60 px-1.5 py-1 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
              onClick={() => onHighlight(p.nodes.map((n) => n.id))}
              title="클릭하면 캔버스에서 이 경로의 노드를 강조합니다"
            >
              {p.nodes.map((n, j) => (
                <span key={j}>
                  {j > 0 && (
                    <span className="text-muted-foreground/60">
                      {' '}
                      —[{p.edges[j - 1]?.type}
                      {p.edges[j - 1]?.bridge ? '·bridge' : ''}]→{' '}
                    </span>
                  )}
                  <span className="font-medium">{n.name}</span>
                </span>
              ))}
            </button>
          ))}
        </div>
      )}

      {sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
          <FileText className="h-3 w-3" /> 출처:
          {sources.slice(0, 6).map((s) => (
            <Badge key={s.nodeId} variant="outline" className="h-5 px-1 text-xs">
              {s.name}
              {s.sourceType ? `·${s.sourceType}` : ''}
            </Badge>
          ))}
        </div>
      )}

      {ungroundedNote && (
        <div className="flex items-start gap-1 text-warning">
          <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
          <span>모델에 근거 없음: {ungroundedNote}</span>
        </div>
      )}
    </div>
  );
}
