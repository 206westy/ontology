'use client';

import { useParams } from 'next/navigation';
import StagePlaceholder from '@/features/problems/components/StagePlaceholder';
import StageConfirmBar from '@/features/problems/components/StageConfirmBar';

// PRD-PF-C M5: 키네틱(결정함수) 단계. 결정함수 엔진(PF-B)은 완료되어 스튜디오 툴바에서 저작·평가 가능 —
// 문제 맥락 전용 UI 는 후속. 지금은 스튜디오의 "결정함수"로 안내.
export default function FunctionsStagePage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto w-full">
      <StagePlaceholder
        title="키네틱 — 결정함수"
        description="속성을 읽어 통과/불통과·점수·추천을 산출하는 결정함수는 온톨로지 구축 단계(스튜디오)의 툴바에서 자연어로 저작·평가할 수 있습니다. 문제 맥락에 특화된 함수 보드는 준비 중입니다."
        cta={{ label: '온톨로지 구축(스튜디오)으로', href: `/problems/${params.id}/studio` }}
      />
      <StageConfirmBar problemId={params.id} step="functions" />
    </div>
  );
}
