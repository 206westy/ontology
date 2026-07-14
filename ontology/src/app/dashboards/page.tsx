'use client';

import dynamic from 'next/dynamic';

// PRD-PF-G: 코드 스플리팅 — 대시보드(ECharts 포함)를 메인 캔버스 번들과 분리(next/dynamic, ssr:false).
const DashboardView = dynamic(() => import('@/features/boards/components/DashboardView'), {
  ssr: false,
});

export default function DashboardsPage() {
  return (
    <div className="h-screen w-screen overflow-auto bg-background">
      <DashboardView />
    </div>
  );
}
