'use client';

import { useParams } from 'next/navigation';
import ProblemScopedStage from '@/features/problems/components/ProblemScopedStage';
import SpcWorkbench from '@/features/spc/components/SpcWorkbench';
import StageConfirmBar from '@/features/problems/components/StageConfirmBar';

// PRD-PF 시퀀스 5단계 — SPC/FDC(토글 ON 일 때만 노출). 문제 스코프 워크벤치.
export default function SpcStagePage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <ProblemScopedStage>
          <SpcWorkbench />
        </ProblemScopedStage>
      </div>
      <div className="shrink-0 border-t border-border p-3">
        <StageConfirmBar problemId={params.id} step="spc" />
      </div>
    </div>
  );
}
