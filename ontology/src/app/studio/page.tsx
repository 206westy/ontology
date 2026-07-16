'use client';

import OntologyStudioShell from '@/features/ontology/components/OntologyStudioShell';

// 두-버전 진입점(1): 온톨로지 스튜디오 단독판. 현행 경험을 그대로 보존한다.
// 본문 로직은 OntologyStudioShell 로 무손실 추출되어 `/problems/[id]/studio` 와 공유된다.
// 라우트 분리(2026-07-16): `/` 는 공개 랜딩으로 옮기고, 스튜디오 단독판은 여기로 이동.
export default function StudioPage() {
  return (
    <div className="h-screen w-screen overflow-hidden">
      <OntologyStudioShell />
    </div>
  );
}
