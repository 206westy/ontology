import { describe, it, expect } from 'vitest';
import {
  computeCalibration,
  type CalibrationSample,
} from '@/features/ontology/lib/metrics/calibration';

describe('computeCalibration', () => {
  it('완벽 보정: confidence == 정답률 → ECE≈0', () => {
    // confidence 0.95 인 10건 중 9~10건 정답이면 보정오차 작음.
    const samples: CalibrationSample[] = [
      ...Array.from({ length: 9 }, () => ({ confidence: 0.95, correct: true })),
      { confidence: 0.95, correct: false },
    ];
    const report = computeCalibration(samples);
    expect(report.samples).toBe(10);
    expect(report.ece).toBeLessThan(0.1);
  });

  it('과신 탐지: confidence 높은데 정답률 낮은 구간', () => {
    // confidence 0.9 인데 절반만 정답 → 과신.
    const samples: CalibrationSample[] = [
      ...Array.from({ length: 5 }, () => ({ confidence: 0.9, correct: true })),
      ...Array.from({ length: 5 }, () => ({ confidence: 0.9, correct: false })),
    ];
    const report = computeCalibration(samples);
    expect(report.overconfidentBins.length).toBeGreaterThan(0);
    expect(report.ece).toBeGreaterThan(0.3); // 0.9 vs 0.5
  });

  it('reliability 곡선 데이터(bins) 반환, 빈 입력은 ECE 0', () => {
    expect(computeCalibration([]).ece).toBe(0);
    const report = computeCalibration(
      [{ confidence: 0.05, correct: false }],
      10,
    );
    expect(report.bins).toHaveLength(10);
    expect(report.bins[0].count).toBe(1); // 0.05 → 첫 bin
  });
});
