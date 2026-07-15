'use client';

import { useParams } from 'next/navigation';
import ProblemScopedStage from '@/features/problems/components/ProblemScopedStage';
import DashboardView from '@/features/boards/components/DashboardView';
import ActionBoard from '@/features/boards/components/ActionBoard';
import StageConfirmBar from '@/features/problems/components/StageConfirmBar';

// PRD-PF 시퀀스 6단계 — 대시보드·액션보드(PF-G). 문제 스코프로 판정 결과를 시각화·처리.
export default function BoardStagePage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <ProblemScopedStage>
          <DashboardView />
          <div className="border-t border-border" />
          <ActionBoard />
        </ProblemScopedStage>
      </div>
      <div className="shrink-0 border-t border-border p-3">
        <StageConfirmBar problemId={params.id} step="board" confirmLabel="문제 해결 완료로 표시" />
      </div>
    </div>
  );
}
