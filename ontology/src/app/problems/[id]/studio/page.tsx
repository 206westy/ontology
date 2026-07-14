'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import OntologyStudioShell from '@/features/ontology/components/OntologyStudioShell';
import { useActiveOntology } from '@/features/workspace/hooks/useActiveOntology';
import { useProblemWorkflowStore } from '@/features/problems/hooks/useProblemWorkflowStore';

// PRD-PF-C M4: 온톨로지 구축 단계 = 기존 스튜디오 무손실 재사용.
// 문제의 주(主) 링크 온톨로지를 활성화한 뒤 셸을 마운트 → fetch 래퍼가 올바른 x-ontology-id 주입.
export default function ProblemStudioPage() {
  const detail = useProblemWorkflowStore((s) => s.detail);
  const setActiveOntologyId = useActiveOntology((s) => s.setActiveOntologyId);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!detail) return;
    const primary = detail.links.find((l) => l.isPrimary) ?? detail.links[0];
    if (primary) setActiveOntologyId(primary.ontologyId);
    setReady(true);
  }, [detail, setActiveOntologyId]);

  // PRD-PF-C 5.4: 문제(분기) 컨텍스트에서 ?merge=1 진입 시 스튜디오의 병합요청 화면을 연다.
  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('merge') !== '1') return;
    window.dispatchEvent(new Event('ontology:merge-requests'));
    params.delete('merge');
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [ready]);

  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <OntologyStudioShell />;
}
