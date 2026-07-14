import { describe, it, expect } from 'vitest';
import { suggestSpc } from '@/lib/spc/suggest';

describe('suggestSpc (결정론 초안)', () => {
  it('비율(0~1) → p 관리도', () => {
    const s = suggestSpc({ sampleValues: [0.02, 0.04, 0.03, 0.05] });
    expect(s.chartType).toBe('p');
  });

  it('음이 아닌 정수(결점수) → c 관리도', () => {
    const s = suggestSpc({ sampleValues: [2, 3, 1, 4, 0] });
    expect(s.chartType).toBe('c');
  });

  it('연속형·개별 → I-MR', () => {
    const s = suggestSpc({ sampleValues: [10.2, 11.1, 9.8, 10.5] });
    expect(s.chartType).toBe('i_mr');
  });

  it('연속형·부분군 → X-bar/R', () => {
    const s = suggestSpc({
      dataType: 'continuous',
      hasSubgroups: true,
      subgroupSize: 5,
    });
    expect(s.chartType).toBe('xbar_r');
  });

  it('데이터 불충분 → 낮은 신뢰의 기본 I-MR', () => {
    const s = suggestSpc({});
    expect(s.chartType).toBe('i_mr');
    expect(s.confidence).toBeLessThan(0.5);
  });

  it('기본 룰셋은 Western Electric(Nelson off)', () => {
    const s = suggestSpc({ sampleValues: [10.2, 11.1, 9.8] });
    expect(s.rulesEnabled).toEqual(['WE1', 'WE2', 'WE3', 'WE4']);
  });
});
