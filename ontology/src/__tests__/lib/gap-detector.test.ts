import { describe, it, expect } from 'vitest';
import {
  detectDeterministicGaps,
  mergeGaps,
  type DetectSubgraph,
} from '@/features/ontology/lib/gap-detector';
import type { Gap } from '@/features/ontology/lib/enrich-types';

describe('detectDeterministicGaps (A-3)', () => {
  it('flags a referenced-but-undefined concept (RF Matcher case)', () => {
    const sg: DetectSubgraph = {
      nodes: [
        { name: 'Chuck', type: '하드웨어', evidence: 'Chuck holds wafer' },
        { name: 'RF Matcher' }, // only referenced, no evidence/description
      ],
      relations: [{ source: 'Chuck', target: 'RF Matcher', type: '연결', confidence: 0.6 }],
    };
    const gaps = detectDeterministicGaps(sg);
    const rf = gaps.find((g) => g.targetName === 'RF Matcher');
    expect(rf?.kind).toBe('undefined_concept');
    expect(rf?.severity).toBe('high');
  });

  it('flags an isolated node with no relations', () => {
    const sg: DetectSubgraph = {
      nodes: [{ name: 'Floating', evidence: 'x' }],
      relations: [],
    };
    const gaps = detectDeterministicGaps(sg);
    const f = gaps.find((g) => g.targetName === 'Floating');
    expect(f?.kind).toBe('isolated');
    expect(f?.severity).toBe('med');
  });

  it('does not flag a well-connected, defined node', () => {
    const sg: DetectSubgraph = {
      nodes: [
        { name: 'A', evidence: 'a', description: 'defined A' },
        { name: 'B', evidence: 'b' },
        { name: 'C', evidence: 'c' },
      ],
      relations: [
        { source: 'A', target: 'B', type: 'r1' },
        { source: 'A', target: 'C', type: 'r2' },
      ],
    };
    const gaps = detectDeterministicGaps(sg);
    expect(gaps.find((g) => g.targetName === 'A')).toBeUndefined();
  });

  it('flags missing_property when siblings have properties but this node does not', () => {
    const sg: DetectSubgraph = {
      nodes: [
        { name: 'Cat', type: 'Animal', evidence: 'x', propertyCount: 3 },
        { name: 'Dog', type: 'Animal', evidence: 'y', propertyCount: 0 },
      ],
      relations: [
        { source: 'Cat', target: 'Dog', type: 'r' },
        { source: 'Dog', target: 'Cat', type: 'r2' },
      ],
    };
    const gaps = detectDeterministicGaps(sg);
    const dog = gaps.find((g) => g.targetName === 'Dog' && g.kind === 'missing_property');
    expect(dog).toBeDefined();
  });

  it('gap count varies with the subgraph (not fixed)', () => {
    const small: DetectSubgraph = { nodes: [{ name: 'X', evidence: 'x' }], relations: [] };
    const big: DetectSubgraph = {
      nodes: [
        { name: 'X', evidence: 'x' },
        { name: 'Y', evidence: 'y' },
        { name: 'Z', evidence: 'z' },
      ],
      relations: [],
    };
    expect(detectDeterministicGaps(small).length).toBeLessThan(
      detectDeterministicGaps(big).length,
    );
  });
});

describe('mergeGaps (A-3)', () => {
  it('dedupes by node+kind and sorts by severity', () => {
    const a: Gap[] = [
      { targetName: 'N', kind: 'isolated', reason: 'r', severity: 'low' },
      { targetName: 'M', kind: 'undefined_concept', reason: 'r', severity: 'high' },
    ];
    const b: Gap[] = [
      { targetName: 'N', kind: 'isolated', reason: 'dup', severity: 'low' },
      { targetName: 'M', kind: 'missing_axiom', reason: 'r', severity: 'med' },
    ];
    const merged = mergeGaps(a, b);
    expect(merged).toHaveLength(3); // N/isolated deduped
    expect(merged[0].severity).toBe('high'); // sorted: high first
  });
});
