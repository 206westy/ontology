'use client';

import Link from 'next/link';
import { ArrowRight, Boxes } from 'lucide-react';

import { Button } from '@/components/ui/button';

// 공개 랜딩(2026-07-16): 루트 `/` 의 순수 진입면. 네비게이션·부가 링크 없이
// 제품 히어로와 단일 CTA(`시작하기`→`/platform`)만 노출한다.
// 로그인 여부와 무관하게 열람 가능(미들웨어 public).
export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* 분위기: 상단에서 번지는 primary 광선(장식). 레이아웃 비영향. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-1/3 h-[70vh] bg-[radial-gradient(60%_60%_at_50%_0%,theme(colors.primary/18%),transparent_70%)]"
      />

      <section className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
        <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm">
          <Boxes className="h-3.5 w-3.5 text-primary" />
          Ontology Studio
        </span>

        <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          지식을 그래프로,
          <br />
          <span className="text-primary">코드 없이</span> 온톨로지로.
        </h1>

        <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
          자유롭게 적어 내려간 지식을 AI가 클래스·속성·관계로 구조화합니다.
          사람은 검토하고 확정하기만 하면 됩니다.
        </p>

        <div className="mt-10">
          <Button asChild size="lg" className="h-12 gap-2 px-7 text-base">
            <Link href="/platform">
              시작하기
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
