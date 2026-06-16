import { describe, it, expect } from 'vitest';
import {
  levenshtein,
  normalizeName,
  findSimilarPairs,
} from '@/features/ontology/lib/similarity';

describe('similarity utils', () => {
  it('levenshtein computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('normalizeName strips case, spaces, underscores, hyphens', () => {
    expect(normalizeName('Dry Asher')).toBe('dryasher');
    expect(normalizeName('dry_asher')).toBe('dryasher');
    expect(normalizeName('DRY-ASHER')).toBe('dryasher');
  });

  it('findSimilarPairs flags exact (normalized) duplicates', () => {
    const pairs = findSimilarPairs([
      { id: '1', name: 'Dry Asher' },
      { id: '2', name: 'DryAsher' },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].exact).toBe(true);
    expect(pairs[0].score).toBe(1);
  });

  it('findSimilarPairs flags near matches and ignores distinct names', () => {
    const pairs = findSimilarPairs([
      { id: '1', name: 'Engineer' },
      { id: '2', name: 'Enginer' }, // distance 1
      { id: '3', name: 'Banana' }, // distinct
    ]);
    const ids = pairs.flatMap((p) => [p.a.id, p.b.id]);
    expect(ids).toContain('1');
    expect(ids).toContain('2');
    expect(ids).not.toContain('3');
  });
});
