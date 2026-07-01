import { describe, it, expect } from 'vitest';
import {
  combinedMatchScore,
  MATCH_VECTOR_WEIGHT,
  MATCH_TRIGRAM_WEIGHT,
} from '@/lib/entity-match/score';

// H5 regression: one shared scoring function so endpoints rank duplicates
// consistently (no per-endpoint Math.max bias toward the vector signal).
describe('combinedMatchScore', () => {
  it('weights both signals when both are present', () => {
    expect(combinedMatchScore(0.9, 0.4)).toBeCloseTo(
      MATCH_VECTOR_WEIGHT * 0.9 + MATCH_TRIGRAM_WEIGHT * 0.4,
      5,
    );
  });

  it('falls back to the single available signal', () => {
    expect(combinedMatchScore(0.8, null)).toBe(0.8);
    expect(combinedMatchScore(null, 0.6)).toBe(0.6);
    expect(combinedMatchScore(null, null)).toBe(0);
  });

  it('does not collapse to the max of the two signals (unlike the old combine)', () => {
    // Old behavior: Math.max(0.95, 0.3) = 0.95. Weighted is lower → trigram matters.
    const score = combinedMatchScore(0.95, 0.3);
    expect(score).toBeLessThan(0.95);
    expect(score).toBeGreaterThan(0.3);
  });
});
