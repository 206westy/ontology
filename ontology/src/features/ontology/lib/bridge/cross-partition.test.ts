import { describe, it, expect } from 'vitest';
import {
  buildBridgeSuggestions,
  DEFAULT_BRIDGE_RELATION,
  type CrossPartitionCandidate,
} from './cross-partition';

const P1 = '00000000-0000-0000-0000-000000000001';
const P2 = '00000000-0000-0000-0000-000000000002';

function candidate(
  over: Partial<CrossPartitionCandidate>,
): CrossPartitionCandidate {
  return {
    sourceId: 'a',
    targetId: 'b',
    sourceName: '펌프447',
    targetName: '펌프447',
    sourcePartition: P1,
    targetPartition: P2,
    kind: 'instance',
    vectorScore: 0.95,
    trigramScore: 0.9,
    ...over,
  };
}

describe('buildBridgeSuggestions (H6 크로스-구획 브릿지)', () => {
  it('통과조건: same entity across two partitions => a bridge candidate', () => {
    const out = buildBridgeSuggestions([candidate({})]);
    expect(out).toHaveLength(1);
    expect(out[0].sourcePartition).toBe(P1);
    expect(out[0].targetPartition).toBe(P2);
  });

  it('excludes same-partition pairs (구획 격리)', () => {
    const out = buildBridgeSuggestions([
      candidate({ sourcePartition: P1, targetPartition: P1 }),
    ]);
    expect(out).toHaveLength(0);
  });

  it('excludes pairs below the combined-score threshold', () => {
    const out = buildBridgeSuggestions([
      candidate({ vectorScore: 0.2, trigramScore: 0.1 }),
    ]);
    expect(out).toHaveLength(0);
  });

  it('통과조건: records evidence and a typed relation on each bridge', () => {
    const out = buildBridgeSuggestions([candidate({})]);
    expect(out[0].relationType).toBe(DEFAULT_BRIDGE_RELATION);
    expect(out[0].evidence).toContain('펌프447');
    expect(out[0].evidence).toContain('구획');
  });

  it('honors a caller-provided relation type and evidence', () => {
    const out = buildBridgeSuggestions([
      candidate({ relationType: 'operated_by', evidence: '동일 설비 번호' }),
    ]);
    expect(out[0].relationType).toBe('operated_by');
    expect(out[0].evidence).toBe('동일 설비 번호');
  });

  it('dedupes symmetric pairs keeping the highest score', () => {
    const out = buildBridgeSuggestions([
      candidate({ sourceId: 'a', targetId: 'b', vectorScore: 0.7, trigramScore: 0.7 }),
      candidate({ sourceId: 'b', targetId: 'a', vectorScore: 0.95, trigramScore: 0.95 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].score).toBeCloseTo(0.95, 5);
  });

  it('sorts suggestions by descending score', () => {
    const out = buildBridgeSuggestions([
      candidate({ sourceId: 'a', targetId: 'b', vectorScore: 0.6, trigramScore: 0.6 }),
      candidate({ sourceId: 'c', targetId: 'd', vectorScore: 0.95, trigramScore: 0.95 }),
    ]);
    expect(out.map((s) => s.sourceId)).toEqual(['c', 'a']);
  });
});
