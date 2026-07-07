'use client';

import { useState, useEffect } from 'react';

// PRD-Perf M2-2: 앱이 가장 먼저 렌더하는 컴포넌트 — 첫 페인트를 motion 런타임
// 파싱과 분리하기 위해 진입/퇴장 애니메이션을 CSS 키프레임·전환으로 대체했다.
// (시각 결과·타이밍·onComplete 계약은 기존 motion 구현과 동일.)

interface SplashScreenProps {
  /** Minimum display time in ms before allowing fade-out */
  minDisplayMs?: number;
  /** Called after the fade-out animation completes */
  onComplete?: () => void;
}

const EXIT_FADE_MS = 400;

export default function SplashScreen({
  minDisplayMs = 1800,
  onComplete,
}: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(elapsed / minDisplayMs, 1);
      setProgress(pct);
      if (pct >= 1) {
        clearInterval(interval);
        setVisible(false);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [minDisplayMs]);

  // 페이드아웃(400ms)이 끝난 뒤 onComplete — AnimatePresence onExitComplete 대응.
  useEffect(() => {
    if (visible) return;
    const timer = setTimeout(() => onComplete?.(), EXIT_FADE_MS);
    return () => clearTimeout(timer);
  }, [visible, onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-background transition-opacity ease-out ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{ transitionDuration: `${EXIT_FADE_MS}ms` }}
    >
      <style>{`
        @keyframes splash-pop { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        @keyframes splash-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes splash-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes splash-bar { from { opacity: 0; transform: scaleX(0.8); } to { opacity: 1; transform: scaleX(1); } }
      `}</style>
      <div className="flex flex-col items-center gap-5">
        {/* Logo mark with ping glow */}
        <div
          className="relative"
          style={{ animation: 'splash-pop 0.4s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        >
          <div
            className="absolute inset-0 rounded-2xl gradient-brand-subtle animate-ping"
            style={{ animationDuration: '2s' }}
          />
          <div className="w-16 h-16 rounded-2xl gradient-brand flex items-center justify-center shadow-lg">
            {/* Inline SVG logo for independence from file loading */}
            <svg
              width="32"
              height="32"
              viewBox="0 0 28 28"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <line
                x1="14" y1="5.5" x2="5.5" y2="21"
                stroke="white" strokeWidth="2" strokeLinecap="round"
              />
              <line
                x1="14" y1="5.5" x2="22.5" y2="21"
                stroke="white" strokeWidth="2" strokeLinecap="round"
              />
              <line
                x1="5.5" y1="21" x2="22.5" y2="21"
                stroke="white" strokeWidth="2" strokeLinecap="round"
              />
              <circle cx="14" cy="5.5" r="3.5" fill="white" />
              <circle cx="5.5" cy="21" r="4" fill="white" />
              <circle cx="22.5" cy="21" r="3.5" fill="white" />
            </svg>
          </div>
        </div>

        {/* Brand text */}
        <div className="text-center">
          <h1
            className="text-display-lg font-bold gradient-brand-text"
            style={{ animation: 'splash-rise 0.5s ease-out 0.2s both' }}
          >
            Ontology Studio
          </h1>
          <p
            className="text-caption text-muted-foreground mt-1.5"
            style={{ animation: 'splash-fade 0.4s ease-out 0.5s both' }}
          >
            Loading workspace...
          </p>
        </div>

        {/* Progress bar */}
        <div
          className="w-36 h-0.5 bg-muted rounded-full overflow-hidden"
          style={{ animation: 'splash-bar 0.4s ease-out 0.3s both' }}
        >
          <div
            className="h-full gradient-brand rounded-full transition-all duration-75 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
