'use client';

import { useParams } from 'next/navigation';
import DataStagePanel from '@/features/datasets/components/DataStagePanel';
import StageConfirmBar from '@/features/problems/components/StageConfirmBar';

// PRD-PF-C M5 / PF-D M4: 데이터 연결 단계. 데이터셋 레지스트리(PF-D)로 재사용.
export default function DataStagePage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto w-full">
      <DataStagePanel problemId={params.id} />
      <StageConfirmBar problemId={params.id} step="data" />
    </div>
  );
}
