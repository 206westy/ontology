'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useActiveOntology } from '@/features/workspace/hooks/useActiveOntology';
import { useProblemWorkflowStore } from '@/features/problems/hooks/useProblemWorkflowStore';

// PRD-PF 시퀀스 봉합: 스테이지가 문제의 주(主) 온톨로지를 활성화한 뒤 자식(재사용 컴포넌트)을 렌더.
// studio 무손실 패턴과 동일 — 기존 x-ontology-id fetch 래퍼가 스코프를 주입한다.
export default function ProblemScopedStage({ children }: { children: React.ReactNode }) {
  const detail = useProblemWorkflowStore((s) => s.detail);
  const setActiveOntologyId = useActiveOntology((s) => s.setActiveOntologyId);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!detail) return;
    const primary = detail.links.find((l) => l.isPrimary) ?? detail.links[0];
    if (primary) setActiveOntologyId(primary.ontologyId);
    setReady(true);
  }, [detail, setActiveOntologyId]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <>{children}</>;
}
