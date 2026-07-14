'use client';

import OntologyStudioShell from '@/features/ontology/components/OntologyStudioShell';

// 두-버전 진입점(1): 온톨로지 스튜디오 단독판. 현행 경험을 그대로 보존한다.
// 본문 로직은 OntologyStudioShell 로 무손실 추출되어 `/problems/[id]/studio` 와 공유된다.
export default function Home() {
  return (
    <div className="h-screen w-screen overflow-hidden">
      <OntologyStudioShell />
    </div>
  );
}
