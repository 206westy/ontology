'use client';

import { useParams } from 'next/navigation';
import ProblemScopedStage from '@/features/problems/components/ProblemScopedStage';
import OperatePanel from '@/features/operate/components/OperatePanel';
import StageConfirmBar from '@/features/problems/components/StageConfirmBar';

// PRD-PF 시퀀스 7단계 — AIP·자동화(H·I). 문제 스코프 답변·제안·트리거.
export default function OperateStagePage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <ProblemScopedStage>
          <OperatePanel />
        </ProblemScopedStage>
      </div>
      <div className="shrink-0 border-t border-border p-3">
        <StageConfirmBar problemId={params.id} step="operate" confirmLabel="운영 준비 완료" />
      </div>
    </div>
  );
}
