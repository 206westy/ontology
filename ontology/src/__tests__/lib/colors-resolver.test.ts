import { describe, it, expect } from 'vitest';
import { hslTripleToHex, resolveThemeColors, NODE_COLORS } from '@/features/ontology/constants/colors';

describe('hslTripleToHex (C-4 colors resolver)', () => {
  it('converts pure colors', () => {
    expect(hslTripleToHex('0 0% 100%')).toBe('#ffffff');
    expect(hslTripleToHex('0 0% 0%')).toBe('#000000');
    expect(hslTripleToHex('0 100% 50%')).toBe('#ff0000');
    expect(hslTripleToHex('120 100% 50%')).toBe('#00ff00');
    expect(hslTripleToHex('240 100% 50%')).toBe('#0000ff');
  });

  it('converts a violet token (hue 263) to a blue-dominant purple', () => {
    const hex = hslTripleToHex('263 70% 50.4%');
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    // 보라색: 파랑 > 빨강 > 초록
    expect(b).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(g);
  });

  it('ignores trailing alpha in the triple', () => {
    expect(hslTripleToHex('0 0% 100% / 0.12')).toBe('#ffffff');
  });

  it('returns fallback on unparseable input', () => {
    expect(hslTripleToHex('garbage', '#abcdef')).toBe('#abcdef');
    expect(hslTripleToHex('1 2', '#abcdef')).toBe('#abcdef');
  });
});

describe('resolveThemeColors', () => {
  it('returns hex node colors and shadcn tokens', () => {
    const c = resolveThemeColors();
    // jsdom엔 CSS 변수 정의가 없어 토큰별 fallback(=NODE_COLORS hex)로 해석된다.
    expect(c.node.root).toBe(NODE_COLORS.root);
    expect(c.node.instance).toBe(NODE_COLORS.instance);
    expect(c.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(c.border).toMatch(/^#[0-9a-f]{6}$/i);
    (Object.keys(NODE_COLORS) as (keyof typeof NODE_COLORS)[]).forEach((k) => {
      expect(c.node[k]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});
