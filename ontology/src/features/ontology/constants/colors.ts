// 채도 낮춘 균일 명도 팔레트 — 도메인은 hue로만 구분, 어느 하나가 god node처럼 튀지 않게.
// 퍼플(--primary)은 선택/강조 전용으로 예약하므로 도메인 색에서 제외.
// JS color values retained for MiniMap nodeColor callback (cannot use CSS vars there).
export const NODE_COLORS = {
  root: '#6487b4',     // muted slate-blue
  mid: '#5794b7',      // muted blue
  leaf: '#4e98a2',     // muted teal-cyan
  instance: '#60a97b', // muted green
  person: '#c09d59',   // muted amber
  place: '#c37760',    // muted terracotta
  event: '#c07296',    // muted rose
  concept: '#8c86c1',  // muted indigo
  process: '#499c8b',  // muted teal
  artifact: '#ae7f5b', // muted brown
} as const;

// Dark palette -- MiniMap only (다크 배경용으로 명도 상향)
export const NODE_COLORS_DARK: Record<keyof typeof NODE_COLORS, string> = {
  root: '#809fc6',
  mid: '#74a9c9',
  leaf: '#62b1bc',
  instance: '#76bc90',
  person: '#cfb277',
  place: '#d4917d',
  event: '#d08bab',
  concept: '#a39ed1',
  process: '#62bcaa',
  artifact: '#c39979',
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
  root:     'rgba(100,135,180,0.12)',
  mid:      'rgba(87,148,183,0.12)',
  leaf:     'rgba(78,152,162,0.12)',
  instance: 'rgba(96,169,123,0.12)',
  person:   'rgba(192,157,89,0.12)',
  place:    'rgba(195,119,96,0.12)',
  event:    'rgba(192,114,150,0.12)',
  concept:  'rgba(140,134,193,0.12)',
  process:  'rgba(73,156,139,0.12)',
  artifact: 'rgba(174,127,91,0.12)',
};

export const NODE_BG_COLORS_DARK: Record<keyof typeof NODE_COLORS, string> = {
  root:     'rgba(128,159,198,0.20)',
  mid:      'rgba(116,169,201,0.20)',
  leaf:     'rgba(98,177,188,0.20)',
  instance: 'rgba(118,188,144,0.18)',
  person:   'rgba(207,178,119,0.20)',
  place:    'rgba(212,145,125,0.20)',
  event:    'rgba(208,139,171,0.20)',
  concept:  'rgba(163,158,209,0.20)',
  process:  'rgba(98,188,170,0.20)',
  artifact: 'rgba(195,153,121,0.20)',
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
  background: '#fafafa',
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
