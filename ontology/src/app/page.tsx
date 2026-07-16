'use client';

import LandingPage from '@/features/landing/components/LandingPage';

// 루트 `/` = 공개 랜딩(2026-07-16). `시작하기`→`/platform`(두-버전 런처).
// 스튜디오 단독판은 `/studio` 로 이동했다.
export default function Home() {
  return <LandingPage />;
}
