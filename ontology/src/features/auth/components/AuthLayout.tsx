'use client';

import Link from 'next/link';

import { BrandHero, BrandLogo } from './BrandHero';

interface AuthLayoutProps {
  title: string;
  description: string;
  children: React.ReactNode;
  /** 카드 하단 보조 영역(링크 등) */
  footer?: React.ReactNode;
}

/**
 * 인증 화면 공용 셸. 좌측 brand hero + 우측 폼 카드의 스플릿 레이아웃.
 * 모바일에서는 hero 를 숨기고 상단 로고만 노출하는 단일 컬럼.
 */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <BrandHero />

      <main className="flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          {/* 모바일 전용 상단 로고 */}
          <Link
            href="/login"
            className="mb-8 flex items-center justify-center gap-2 lg:hidden"
          >
            <BrandLogo className="h-10 w-10" />
            <span className="text-heading-sm font-bold gradient-brand-text">
              Ontology Studio
            </span>
          </Link>

          <div className="mb-6 text-center lg:text-left">
            <h1 className="text-heading font-bold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="text-body-sm mt-1.5 text-muted-foreground">{description}</p>
          </div>

          {children}

          {footer ? (
            <div className="text-body-sm mt-6 text-center text-muted-foreground">
              {footer}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
