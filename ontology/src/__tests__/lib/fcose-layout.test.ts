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

describe('buildColaOptions (C-4 live physics)', () => {
  it('produces an infinite, grabbable cola simulation', () => {
    const o = buildColaOptions() as Record<string, unknown>;
    expect(o.name).toBe('cola');
    expect(o.infinite).toBe(true);
    expect(o.fit).toBe(false);
    expect(o.animate).toBe(true);
    expect(o.ungrabifyWhileSimulating).toBe(false);
    // edgeLength는 관계 타입별 차등 거리 함수 — 계층(isa)은 짧게, 일반 관계는 길게.
    expect(typeof o.edgeLength).toBe('function');
    const edgeLength = o.edgeLength as (e: { hasClass: (c: string) => boolean }) => number;
    const isaLen = edgeLength({ hasClass: (c) => c === 'isa' });
    const relLen = edgeLength({ hasClass: () => false });
    expect(isaLen).toBeLessThan(relLen);
    expect(typeof o.nodeSpacing).toBe('number');
    expect(o.avoidOverlap).toBe(true);
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
