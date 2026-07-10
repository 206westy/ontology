import { describe, it, expect } from 'vitest';
import {
  detectCommunities,
  assignClusterColors,
  assignClusterBorderStyles,
  clusterColor,
  computeSeedPositions,
  type ClusterEdge,
} from '@/features/ontology/lib/graph-cluster';

describe('detectCommunities (Louvain local-moving)', () => {
  it('returns empty map for no nodes', () => {
    expect(detectCommunities([], []).size).toBe(0);
  });

  it('assigns every node a singleton community when there are no edges', () => {
    const c = detectCommunities(['a', 'b', 'c'], []);
    expect(new Set(c.values()).size).toBe(3);
  });

  it('groups two clearly separated cliques into two communities', () => {
    // 클리크1: a-b-c 삼각형, 클리크2: x-y-z 삼각형, 둘 사이 단일 다리 c-x.
    const edges: ClusterEdge[] = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'a', target: 'c' },
      { source: 'x', target: 'y' },
      { source: 'y', target: 'z' },
      { source: 'x', target: 'z' },
      { source: 'c', target: 'x' },
    ];
    const c = detectCommunities(['a', 'b', 'c', 'x', 'y', 'z'], edges);
    // a,b,c 는 같은 군집, x,y,z 는 같은 군집, 서로는 다른 군집.
    expect(c.get('a')).toBe(c.get('b'));
    expect(c.get('b')).toBe(c.get('c'));
    expect(c.get('x')).toBe(c.get('y'));
    expect(c.get('y')).toBe(c.get('z'));
    expect(c.get('a')).not.toBe(c.get('x'));
  });

  it('produces contiguous 0..K-1 labels', () => {
    const edges: ClusterEdge[] = [
      { source: 'a', target: 'b' },
      { source: 'x', target: 'y' },
    ];
    const c = detectCommunities(['a', 'b', 'x', 'y'], edges);
    const labels = [...new Set(c.values())].sort((p, q) => p - q);
    expect(labels[0]).toBe(0);
    expect(labels[labels.length - 1]).toBe(labels.length - 1);
  });

  it('ignores self-loops and dangling edges', () => {
    const edges: ClusterEdge[] = [
      { source: 'a', target: 'a' }, // self loop
      { source: 'a', target: 'ghost' }, // dangling
      { source: 'a', target: 'b' },
    ];
    const c = detectCommunities(['a', 'b'], edges);
    expect(c.get('a')).toBe(c.get('b'));
  });
});

describe('assignClusterColors / clusterColor', () => {
  it('gives distinct colors to distinct communities', () => {
    const community = new Map([
      ['a', 0],
      ['b', 0],
      ['c', 1],
    ]);
    const colors = assignClusterColors(community, false);
    expect(colors.get(0)).not.toBe(colors.get(1));
  });

  it('returns an hsl() string cytoscape can parse', () => {
    expect(clusterColor(0, false)).toMatch(/^hsl\(/);
    expect(clusterColor(3, true)).toMatch(/^hsl\(/);
  });

  it('keeps every cluster hue within the brand-purple family band [228,296]', () => {
    for (let i = 0; i < 200; i++) {
      const hue = Number(clusterColor(i, false).match(/hsl\(([\d.]+)/)![1]);
      expect(hue).toBeGreaterThanOrEqual(228);
      expect(hue).toBeLessThanOrEqual(296);
    }
  });

  it('distinguishes adjacent ranks by lightness even when hues are close', () => {
    const l = (rank: number) => Number(clusterColor(rank, false).match(/,\s*[\d.]+%,\s*([\d.]+)%/)![1]);
    // 명도 3계단 순환 → 인접 순위는 서로 다른 명도.
    expect(l(0)).not.toBe(l(1));
    expect(l(1)).not.toBe(l(2));
  });

  it('assigns a non-color secondary channel (border style) per community', () => {
    const community = new Map([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
    const styles = assignClusterBorderStyles(community);
    // 인접 순위(0,1,2)는 서로 다른 패턴 → 색각 대비 채널.
    expect(styles.get(0)).not.toBe(styles.get(1));
    expect(styles.get(1)).not.toBe(styles.get(2));
    for (const s of styles.values()) expect(['solid', 'dashed', 'dotted']).toContain(s);
  });
});

describe('computeSeedPositions', () => {
  it('returns a position for every node', () => {
    const community = new Map([
      ['a', 0],
      ['b', 0],
      ['c', 1],
    ]);
    const seeds = computeSeedPositions({ nodeIds: ['a', 'b', 'c'], community });
    expect(seeds.size).toBe(3);
    for (const p of seeds.values()) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('seeds an instance near its parent class', () => {
    const community = new Map([
      ['cls', 0],
      ['inst', 0],
    ]);
    const parentOf = new Map([['inst', 'cls']]);
    const seeds = computeSeedPositions({ nodeIds: ['cls', 'inst'], community, parentOf, spacing: 100 });
    const cls = seeds.get('cls')!;
    const inst = seeds.get('inst')!;
    const dist = Math.hypot(cls.x - inst.x, cls.y - inst.y);
    // 부모 주변 소형 링(spacing*0.35) 안쪽 — 군집 반경보다 확실히 가깝다.
    expect(dist).toBeLessThan(60);
  });

  it('is deterministic (same input → same output)', () => {
    const community = new Map([
      ['a', 0],
      ['b', 1],
    ]);
    const s1 = computeSeedPositions({ nodeIds: ['a', 'b'], community });
    const s2 = computeSeedPositions({ nodeIds: ['a', 'b'], community });
    expect(s1.get('a')).toEqual(s2.get('a'));
    expect(s1.get('b')).toEqual(s2.get('b'));
  });
});
