import { describe, it, expect } from 'vitest';
import { buildFcoseOptions, buildDagreOptions, buildColaOptions } from '@/features/ontology/lib/fcose-layout';

describe('buildFcoseOptions (C-4)', () => {
  it('produces fcose defaults', () => {
    const o = buildFcoseOptions() as Record<string, unknown>;
    expect(o.name).toBe('fcose');
    expect(o.animate).toBe(true);
    expect(o.randomize).toBe(true);
    expect(o.fit).toBe(true);
    expect(o.fixedNodeConstraint).toBeUndefined();
  });

  it('honors overrides and attaches fixedNodeConstraint when fixed nodes given', () => {
    const fixed = [{ nodeId: 'a', position: { x: 1, y: 2 } }];
    const o = buildFcoseOptions({ randomize: false, fit: false, animate: false, fixed }) as Record<string, unknown>;
    expect(o.randomize).toBe(false);
    expect(o.fit).toBe(false);
    expect(o.animate).toBe(false);
    expect(o.fixedNodeConstraint).toEqual(fixed);
  });

  it('omits fixedNodeConstraint for empty fixed array', () => {
    const o = buildFcoseOptions({ fixed: [] }) as Record<string, unknown>;
    expect(o.fixedNodeConstraint).toBeUndefined();
  });
});

describe('buildColaOptions (라이브 물리, 워프-안전)', () => {
  it('produces an infinite cola sim with disconnected-repack disabled (no warp)', () => {
    const o = buildColaOptions() as Record<string, unknown>;
    expect(o.name).toBe('cola');
    expect(o.infinite).toBe(true);
    expect(o.fit).toBe(false);
    expect(o.randomize).toBe(false); // 현재 좌표에서 시작 → 순간이동 없음
    expect(o.handleDisconnected).toBe(false); // 격자 재배치 금지 → 워프 원천 차단
    expect(o.ungrabifyWhileSimulating).toBe(false);
    expect(typeof o.edgeLength).toBe('function');
  });
});

describe('buildDagreOptions (C-4)', () => {
  it('produces dagre TB layout', () => {
    const o = buildDagreOptions() as Record<string, unknown>;
    expect(o.name).toBe('dagre');
    expect(o.rankDir).toBe('TB');
    expect(o.fit).toBe(true);
    expect(buildDagreOptions(false).fit as unknown).toBe(false);
  });
});
