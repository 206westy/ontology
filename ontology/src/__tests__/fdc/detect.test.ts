import { describe, it, expect } from 'vitest';
import { detectThreshold, detectTrend } from '@/lib/fdc/detect';

describe('detectThreshold', () => {
  it('상한 초과를 탐지한다', () => {
    const r = detectThreshold({ values: [1, 2, 3, 10], upper: 5 });
    expect(r.faultFlag).toBe(true);
    expect(r.violatingIndices).toEqual([3]);
    expect(r.score).toBe(5); // 10-5
  });

  it('하한 미달을 탐지한다', () => {
    const r = detectThreshold({ values: [5, 4, -2], lower: 0 });
    expect(r.faultFlag).toBe(true);
    expect(r.violatingIndices).toEqual([2]);
    expect(r.score).toBe(2);
  });

  it('정상 범위는 무결', () => {
    const r = detectThreshold({ values: [1, 2, 3], upper: 5, lower: 0 });
    expect(r.faultFlag).toBe(false);
    expect(r.score).toBe(0);
    expect(r.violatingIndices).toEqual([]);
  });
});

describe('detectTrend', () => {
  it('드리프트(기울기)를 탐지한다', () => {
    const r = detectTrend({ values: [1, 2, 3, 4, 5, 6], driftSlopeThreshold: 0.5 });
    expect(r.faultFlag).toBe(true);
    expect((r.detail.slope as number)).toBeCloseTo(1, 6);
  });

  it('급변(연속 차분)을 탐지한다', () => {
    const r = detectTrend({ values: [1, 1, 1, 9, 1], jumpThreshold: 3 });
    expect(r.faultFlag).toBe(true);
    expect(r.violatingIndices).toContain(3);
  });

  it('안정 신호는 무결', () => {
    const r = detectTrend({
      values: [1, 1.1, 0.9, 1, 1.05],
      jumpThreshold: 3,
      driftSlopeThreshold: 1,
    });
    expect(r.faultFlag).toBe(false);
  });
});
