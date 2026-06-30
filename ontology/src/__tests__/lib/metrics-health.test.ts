import { describe, it, expect } from 'vitest';
import {
  computeDegrees,
  starIndex,
  isolationRate,
  provenanceCoverage,
  duplicateCandidateRate,
  computeHealth,
  type MetricsModel,
} from '@/features/ontology/lib/metrics/health';

// Helpers to build minimal models.
const node = (id: string, name: string, sourceType?: string | null) => ({ id, name, sourceType });
const edge = (sourceId: string, targetId: string, sourceType?: string | null) => ({ sourceId, targetId, sourceType });

describe('computeDegrees', () => {
  it('counts incident edges per node', () => {
    const deg = computeDegrees([edge('a', 'b'), edge('a', 'c')]);
    expect(deg.get('a')).toBe(2);
    expect(deg.get('b')).toBe(1);
    expect(deg.get('c')).toBe(1);
  });
});

describe('starIndex', () => {
  it('is 0 for an edgeless model', () => {
    expect(starIndex([])).toEqual({ value: 0, hubNodeId: null, hubDegree: 0 });
  });

  it('approaches 1 and identifies the hub for a star graph', () => {
    // hub 'h' connected to 4 leaves — classic star.
    const edges = [edge('h', 'a'), edge('h', 'b'), edge('h', 'c'), edge('h', 'd')];
    const s = starIndex(edges);
    expect(s.value).toBe(1); // hubDegree 4 / 4 edges
    expect(s.hubNodeId).toBe('h');
    expect(s.hubDegree).toBe(4);
  });

  it('is low for a distributed (chain) graph', () => {
    // a-b-c-d-e chain: max degree 2, 4 edges → 0.5
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'd'), edge('d', 'e')];
    expect(starIndex(edges).value).toBe(0.5);
  });
});

describe('isolationRate', () => {
  it('is 0 for an empty model', () => {
    const m: MetricsModel = { classes: [], instances: [], edges: [] };
    expect(isolationRate(m)).toEqual({ rate: 0, isolatedCount: 0, nodeCount: 0 });
  });

  it('flags nodes with <=1 incident edge', () => {
    // c1 has 2 edges (connected), c2/c3 have 1 each, i1 has 0 (isolated).
    const m: MetricsModel = {
      classes: [node('c1', 'C1'), node('c2', 'C2'), node('c3', 'C3')],
      instances: [node('i1', 'I1')],
      edges: [edge('c1', 'c2'), edge('c1', 'c3')],
    };
    const r = isolationRate(m);
    expect(r.nodeCount).toBe(4);
    // c2, c3 (degree 1) and i1 (degree 0) are isolated; c1 (degree 2) is not.
    expect(r.isolatedCount).toBe(3);
    expect(r.rate).toBeCloseTo(0.75);
  });
});

describe('provenanceCoverage', () => {
  it('is 1 (vacuous) for an empty model', () => {
    expect(provenanceCoverage({ classes: [], instances: [], edges: [] })).toBe(1);
  });

  it('counts classes + edges with a non-empty sourceType', () => {
    const m: MetricsModel = {
      classes: [node('c1', 'C1', 'document'), node('c2', 'C2', null)],
      instances: [],
      edges: [edge('c1', 'c2', 'document'), edge('c2', 'c1', '   ')],
    };
    // 2 covered (c1, edge1) out of 4 elements.
    expect(provenanceCoverage(m)).toBe(0.5);
  });
});

describe('duplicateCandidateRate', () => {
  it('detects near-duplicate names within the same kind', () => {
    const m: MetricsModel = {
      classes: [node('c1', 'Chuck'), node('c2', 'Chuk')], // near-duplicate
      instances: [],
      edges: [],
    };
    const r = duplicateCandidateRate(m);
    expect(r.pairs).toBe(1);
    expect(r.rate).toBeCloseTo(0.5); // 1 pair / 2 nodes
  });

  it('does not flag a class and instance sharing a name', () => {
    const m: MetricsModel = {
      classes: [node('c1', 'Chuck')],
      instances: [node('i1', 'Chuck')],
      edges: [],
    };
    expect(duplicateCandidateRate(m).pairs).toBe(0);
  });
});

describe('computeHealth', () => {
  it('returns a perfect-ish score for an empty model', () => {
    const r = computeHealth({ classes: [], instances: [], edges: [] });
    expect(r.score).toBe(100);
    expect(r.nodeCount).toBe(0);
  });

  it('penalizes a star-shaped, low-provenance model', () => {
    const m: MetricsModel = {
      classes: [node('h', 'Hub'), node('a', 'A'), node('b', 'B'), node('c', 'C')],
      instances: [],
      edges: [edge('h', 'a'), edge('h', 'b'), edge('h', 'c')],
    };
    const r = computeHealth(m);
    expect(r.starIndex).toBe(1);
    expect(r.hubNodeId).toBe('h');
    // a/b/c are degree-1 (isolated), provenance 0 → score should be low.
    expect(r.score).toBeLessThan(40);
  });

  it('rewards a connected, fully-attributed model', () => {
    const m: MetricsModel = {
      classes: [node('a', 'A', 'document'), node('b', 'B', 'document'), node('c', 'C', 'document')],
      instances: [],
      edges: [edge('a', 'b', 'document'), edge('b', 'c', 'document'), edge('c', 'a', 'document')],
    };
    const r = computeHealth(m);
    expect(r.provenanceCoverage).toBe(1);
    expect(r.isolationRate).toBe(0); // triangle: every node degree 2
    expect(r.score).toBeGreaterThan(75);
  });
});
