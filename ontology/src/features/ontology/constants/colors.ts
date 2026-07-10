// Purple Rebrand: 무지개 폐지 — 보라 유사색 팔레트(인디고~마젠타, hue 246~292). 같은 색상류로 응집하되 hue로 구분.
// globals.css `--node-*`(HSL)와 동일 값의 hex 미러 — 캔버스(CSS var)와 스와치·미니맵(JS hex)이 어긋나지 않게.
// JS color values retained for MiniMap·필터 스와치·색선택(cannot use CSS vars there).
export const NODE_COLORS = {
  root: '#4026c5',     // 250 68% 46%
  mid: '#6c2bd4',      // 263 66% 50%
  leaf: '#9746ce',     // 276 58% 54%
  instance: '#b964ce', // 288 52% 60%
  person: '#8060d7',   // 256 60% 61%
  place: '#a16ed4',    // 270 54% 63%
  event: '#ab5ec9',    // 283 50% 58%
  concept: '#8378d9',  // 247 56% 66%
  process: '#c680d0',  // 292 46% 66%
  artifact: '#b893d7', // 273 46% 71%
} as const;

// Dark palette -- MiniMap·스와치 (다크 배경용으로 명도 상향; globals.css .dark `--node-*` 미러)
export const NODE_COLORS_DARK: Record<keyof typeof NODE_COLORS, string> = {
  root: '#7662da',     // 250 62% 62%
  mid: '#9970db',      // 263 60% 65%
  leaf: '#b780db',     // 276 56% 68%
  instance: '#cd94db', // 288 50% 72%
  person: '#9f88dd',   // 256 56% 70%
  place: '#b892dd',    // 270 52% 72%
  event: '#c28ed7',    // 283 48% 70%
  concept: '#a199e1',  // 247 54% 74%
  process: '#d39edb',  // 292 46% 74%
  artifact: '#c7a9df', // 273 46% 77%
};

export const NODE_COLOR_LABELS: Record<keyof typeof NODE_COLORS, string> = {
  root: '루트',
  mid: '중간',
  leaf: '하위',
  instance: '인스턴스',
  person: '사람',
  place: '장소',
  event: '이벤트',
  concept: '개념',
  process: '프로세스',
  artifact: '산출물',
};

// JS bg fills -- kept for getNodeColors() compatibility (MiniMap / legacy callers)
export const NODE_BG_COLORS: Record<keyof typeof NODE_COLORS, string> = {
  root:     'rgba(64,38,197,0.12)',
  mid:      'rgba(108,43,212,0.12)',
  leaf:     'rgba(151,70,206,0.12)',
  instance: 'rgba(185,100,206,0.12)',
  person:   'rgba(128,96,215,0.12)',
  place:    'rgba(161,110,212,0.12)',
  event:    'rgba(171,94,201,0.12)',
  concept:  'rgba(131,120,217,0.12)',
  process:  'rgba(198,128,208,0.12)',
  artifact: 'rgba(184,147,215,0.12)',
};

export const NODE_BG_COLORS_DARK: Record<keyof typeof NODE_COLORS, string> = {
  root:     'rgba(118,98,218,0.20)',
  mid:      'rgba(153,112,219,0.20)',
  leaf:     'rgba(183,128,219,0.20)',
  instance: 'rgba(205,148,219,0.18)',
  person:   'rgba(159,136,221,0.20)',
  place:    'rgba(184,146,221,0.20)',
  event:    'rgba(194,142,215,0.20)',
  concept:  'rgba(161,153,225,0.20)',
  process:  'rgba(211,158,219,0.20)',
  artifact: 'rgba(199,169,223,0.20)',
};

// Fallback JS-based helper (MiniMap / legacy). Prefer getNodeCssColors() in components.
export function getNodeColors(
  colorKey: keyof typeof NODE_COLORS,
  isDark: boolean,
): { borderColor: string; bgColor: string } {
  return {
    borderColor: (isDark ? NODE_COLORS_DARK : NODE_COLORS)[colorKey] ?? NODE_COLORS.root,
    bgColor: (isDark ? NODE_BG_COLORS_DARK : NODE_BG_COLORS)[colorKey] ?? NODE_BG_COLORS.root,
  };
}

// CSS variable names -- used in ClassNode/InstanceNode via hsl(var(--node-xxx))
export const NODE_CSS_VARS: Record<keyof typeof NODE_COLORS, { border: string; bg: string }> = {
  root:     { border: '--node-root',     bg: '--node-root-bg' },
  mid:      { border: '--node-mid',      bg: '--node-mid-bg' },
  leaf:     { border: '--node-leaf',     bg: '--node-leaf-bg' },
  instance: { border: '--node-instance', bg: '--node-instance-bg' },
  person:   { border: '--node-person',   bg: '--node-person-bg' },
  place:    { border: '--node-place',    bg: '--node-place-bg' },
  event:    { border: '--node-event',    bg: '--node-event-bg' },
  concept:  { border: '--node-concept',  bg: '--node-concept-bg' },
  process:  { border: '--node-process',  bg: '--node-process-bg' },
  artifact: { border: '--node-artifact', bg: '--node-artifact-bg' },
};

export function getNodeCssColors(colorKey: keyof typeof NODE_COLORS): {
  borderColor: string;
  bgColor: string;
} {
  const vars = NODE_CSS_VARS[colorKey];
  return {
    borderColor: `hsl(var(${vars.border}))`,
    bgColor: `hsl(var(${vars.bg}))`,
  };
}

// ── Cytoscape용 테마 색 해석 ──────────────────────────────────────────────
// Cytoscape 스타일시트는 CSS `var(...)`를 해석하지 못한다. 런타임에 CSS 변수(HSL 트리플)를
// 구체 hex로 변환해 주입하고, 다크모드 전환 시 재해석한다. (하드코딩 금지 — 토큰에서만 읽음)

export interface ResolvedThemeColors {
  node: Record<keyof typeof NODE_COLORS, string>; // hex
  primary: string;
  border: string;
  card: string;
  foreground: string;
  mutedForeground: string;
  background: string;
}

/** "H S% L%" (또는 알파 포함 "H S% L% / A") HSL 트리플을 hex로 변환. 파싱 실패 시 fallback. */
export function hslTripleToHex(triple: string, fallback = '#000000'): string {
  const cleaned = triple.split('/')[0].trim(); // 알파 제거
  const parts = cleaned.split(/\s+/);
  if (parts.length < 3) return fallback;
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  if (Number.isNaN(h) || Number.isNaN(s) || Number.isNaN(l)) return fallback;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const SHADCN_FALLBACK: Omit<ResolvedThemeColors, 'node'> = {
  primary: '#7c3aed',
  border: '#e4e4e7',
  card: '#ffffff',
  foreground: '#18181b',
  mutedForeground: '#71717a',
  background: '#ffffff',
};

/** 현재 :root/.dark 계산값에서 노드·shadcn 색 토큰을 읽어 hex로 해석. SSR/비브라우저면 fallback. */
export function resolveThemeColors(): ResolvedThemeColors {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { node: { ...NODE_COLORS }, ...SHADCN_FALLBACK };
  }
  const cs = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => {
    const raw = cs.getPropertyValue(name).trim();
    return raw ? hslTripleToHex(raw, fallback) : fallback;
  };

  const node = {} as Record<keyof typeof NODE_COLORS, string>;
  (Object.keys(NODE_CSS_VARS) as (keyof typeof NODE_COLORS)[]).forEach((k) => {
    node[k] = read(NODE_CSS_VARS[k].border, NODE_COLORS[k]);
  });

  return {
    node,
    primary: read('--primary', SHADCN_FALLBACK.primary),
    border: read('--border', SHADCN_FALLBACK.border),
    card: read('--card', SHADCN_FALLBACK.card),
    foreground: read('--foreground', SHADCN_FALLBACK.foreground),
    mutedForeground: read('--muted-foreground', SHADCN_FALLBACK.mutedForeground),
    background: read('--background', SHADCN_FALLBACK.background),
  };
}
