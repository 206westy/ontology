'use client';

import dynamic from 'next/dynamic';

// PRD-PF-G: 코드 스플리팅 — 액션보드를 메인 캔버스 번들과 분리(next/dynamic).
const ActionBoard = dynamic(() => import('@/features/boards/components/ActionBoard'), {
  ssr: false,
});

export default function ActionBoardPage() {
  return (
    <div className="h-screen w-screen overflow-auto bg-background">
      <ActionBoard />
    </div>
  );
}
