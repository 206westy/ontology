// JS color values retained for MiniMap nodeColor callback (cannot use CSS vars there)
export const NODE_COLORS = {
  root: '#7c3aed',
  mid: '#2563eb',
  leaf: '#0891b2',
  instance: '#86efac',
  person: '#d97706',
  place: '#dc2626',
  event: '#db2777',
} as const;

// Dark palette — MiniMap only
export const NODE_COLORS_DARK: Record<keyof typeof NODE_COLORS, string> = {
  root: '#8b5cf6',
  mid: '#3b82f6',
  leaf: '#06b6d4',
  instance: '#4ade80',
  person: '#f59e0b',
  place: '#ef4444',
  event: '#ec4899',
};

export const NODE_COLOR_LABELS: Record<keyof typeof NODE_COLORS, string> = {
  root: '루트',
  mid: '중간',
  leaf: '하위',
  instance: '인스턴스',
  person: '사람',
  place: '장소',
  event: '이벤트',
};

// JS bg fills — kept for getNodeColors() compatibility (MiniMap / legacy callers)
export const NODE_BG_COLORS: Record<keyof typeof NODE_COLORS, string> = {
  root:     'rgba(124,58,237,0.12)',
  mid:      'rgba(37,99,235,0.12)',
  leaf:     'rgba(8,145,178,0.12)',
  instance: 'rgba(134,239,172,0.12)',
  person:   'rgba(217,119,6,0.12)',
  place:    'rgba(220,38,38,0.12)',
  event:    'rgba(219,39,119,0.12)',
};

export const NODE_BG_COLORS_DARK: Record<keyof typeof NODE_COLORS, string> = {
  root:     'rgba(124,58,237,0.20)',
  mid:      'rgba(37,99,235,0.20)',
  leaf:     'rgba(8,145,178,0.20)',
  instance: 'rgba(134,239,172,0.15)',
  person:   'rgba(217,119,6,0.20)',
  place:    'rgba(220,38,38,0.20)',
  event:    'rgba(219,39,119,0.20)',
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

// CSS variable names — used in ClassNode/InstanceNode via hsl(var(--node-xxx))
export const NODE_CSS_VARS: Record<keyof typeof NODE_COLORS, { border: string; bg: string }> = {
  root:     { border: '--node-root',     bg: '--node-root-bg' },
  mid:      { border: '--node-mid',      bg: '--node-mid-bg' },
  leaf:     { border: '--node-leaf',     bg: '--node-leaf-bg' },
  instance: { border: '--node-instance', bg: '--node-instance-bg' },
  person:   { border: '--node-person',   bg: '--node-person-bg' },
  place:    { border: '--node-place',    bg: '--node-place-bg' },
  event:    { border: '--node-event',    bg: '--node-event-bg' },
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
