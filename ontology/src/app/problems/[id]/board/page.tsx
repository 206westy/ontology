'use client';

import { useParams } from 'next/navigation';
import StagePlaceholder from '@/features/problems/components/StagePlaceholder';
import StageConfirmBar from '@/features/problems/components/StageConfirmBar';

// PRD-PF-C M5: 대시보드·액션보드 단계(스텁). 실제 뷰 빌더·차트는 PF-G.
export default function BoardStagePage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto w-full">
      <StagePlaceholder
        title="대시보드 · 액션보드"
        description="결정함수 출력(판정·점수·시계열)을 관리도·KPI·처리 큐로 시각화하는 보드 빌더는 준비 중입니다(PF-G)."
      />
      <StageConfirmBar problemId={params.id} step="board" confirmLabel="문제 해결 완료로 표시" />
    </div>
  );
}
