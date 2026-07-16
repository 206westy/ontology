'use client';

import Link from 'next/link';
import { Workflow, Boxes, ArrowRight } from 'lucide-react';

// PRD-PF: 두 버전 진입점 런처.
// 라우트 분리(2026-07-16): `/` = 공개 랜딩, `/studio` = 온톨로지 스튜디오 단독,
// `/problems` = 문제해결 워크플로우(PF-C~). 이 런처는 `/`의 `시작하기`에서 진입한다.
const STAGES = ['문제정의', '데이터 연결·재사용', '온톨로지 구축', '결정함수', 'SPC/FDC', '대시보드·액션보드', 'AIP·자동화'];

export default function PlatformLauncher() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="max-w-3xl w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold">무엇으로 시작할까요?</h1>
          <p className="text-muted-foreground">두 가지 방식으로 이용할 수 있습니다.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* 진입점 1: 스튜디오 단독 */}
          <Link
            href="/studio"
            className="group rounded-xl border border-border bg-card p-6 space-y-3 hover:border-primary/50 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-2 text-primary">
              <Boxes className="w-6 h-6" />
              <h2 className="text-lg font-semibold">온톨로지 스튜디오</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              지식 그래프를 자유롭게 스케치하고 AI가 비평합니다. 문제 절차 없이
              바로 온톨로지를 만들고 싶을 때.
            </p>
            <div className="flex items-center gap-1 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              단독으로 열기 <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          {/* 진입점 2: 문제해결 워크플로우 */}
          <Link
            href="/problems"
            className="group rounded-xl border border-border bg-card p-6 space-y-3 hover:border-primary/50 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-2 text-primary">
              <Workflow className="w-6 h-6" />
              <h2 className="text-lg font-semibold">문제해결 플랫폼</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              문제를 정의하고 데이터를 연결하면, AI가 온톨로지·결정함수·보드를 초안으로
              지어 주고 사람은 단계마다 확정합니다. 온톨로지는 다음 문제에서 재사용됩니다.
            </p>
            <div className="flex items-center gap-1 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              워크플로우 시작 <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground">
          {STAGES.map((s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="rounded-full bg-muted px-2 py-0.5">{s}</span>
              {i < STAGES.length - 1 && <span className="text-muted-foreground/40">→</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
