// PRD-PF-G: ECharts 약점 보강 — Tailwind/다크모드 정합. 기존 테마 CSS 변수(HSL 프래그먼트)를
// hsl() 로 래핑해 재사용 → 라이트/다크가 기존 토큰과 자동 정합(별도 색 중복 정의 없음, DRY).
import type { Palette } from '@/lib/boards/build-option';

function hslVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return `hsl(${fallback})`;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return `hsl(${v || fallback})`;
}

export function readPalette(): Palette {
  return {
    line: hslVar('--chart-1', '263 70% 50%'),
    marker: hslVar('--chart-1', '263 70% 50%'),
    warn: hslVar('--warning', '38 92% 50%'),
    fail: hslVar('--destructive', '358 72% 54%'),
    limit: hslVar('--destructive', '358 72% 54%'),
    center: hslVar('--chart-4', '240 5% 65%'),
    text: hslVar('--muted-foreground', '240 4% 46%'),
    axis: hslVar('--border', '240 6% 91%'),
    grid: hslVar('--border', '240 6% 91%'),
  };
}
