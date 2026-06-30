'use client';

/** Ontology Studio 로고 마크 — SplashScreen 과 동일한 인라인 SVG. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <div
      className={`gradient-brand flex items-center justify-center rounded-2xl shadow-lg ${className ?? 'h-14 w-14'}`}
    >
      <svg
        width="30"
        height="30"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <line x1="14" y1="5.5" x2="5.5" y2="21" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <line x1="14" y1="5.5" x2="22.5" y2="21" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <line x1="5.5" y1="21" x2="22.5" y2="21" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <circle cx="14" cy="5.5" r="3.5" fill="white" />
        <circle cx="5.5" cy="21" r="4" fill="white" />
        <circle cx="22.5" cy="21" r="3.5" fill="white" />
      </svg>
    </div>
  );
}

/**
 * 인증 화면 좌측 brand hero. 데스크탑에서만 노출(스플릿 레이아웃).
 * 도메인 전문가 대상의 가치제안 한 줄 + 신뢰 포인트.
 */
export function BrandHero() {
  return (
    <div className="relative hidden h-full flex-col justify-between overflow-hidden bg-muted/30 p-12 lg:flex">
      <div className="gradient-brand-subtle pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative flex items-center gap-3">
        <BrandLogo className="h-11 w-11" />
        <span className="text-heading font-bold gradient-brand-text">Ontology Studio</span>
      </div>

      <div className="relative max-w-md">
        <h2 className="text-display-lg font-bold leading-tight text-foreground">
          지식을 코드 없이
          <br />
          구조화하세요
        </h2>
        <p className="text-body mt-4 text-muted-foreground">
          자유롭게 작성한 텍스트가 클래스·속성·관계로 정리됩니다. 검토하고
          승인하면 그대로 지식 그래프가 됩니다.
        </p>
      </div>

      <ul className="text-body-sm relative space-y-2 text-muted-foreground">
        <li className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          붙여넣기 한 번으로 초안 생성
        </li>
        <li className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          반영 전 미리보기와 변경 이력
        </li>
        <li className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          신뢰할 수 있는 AI 제안과 출처 표시
        </li>
      </ul>
    </div>
  );
}
