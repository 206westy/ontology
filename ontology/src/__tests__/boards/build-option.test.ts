import { describe, it, expect } from 'vitest';
import {
  buildControlChartOption,
  buildHistogramOption,
  type Palette,
} from '@/lib/boards/build-option';

const P: Palette = {
  line: '#8b5cf6',
  marker: '#8b5cf6',
  warn: '#f59e0b',
  fail: '#ef4444',
  limit: '#ef4444',
  center: '#64748b',
  text: '#111',
  axis: '#999',
  grid: '#eee',
};

describe('buildControlChartOption', () => {
  it('UCL/LCL/CL 을 markLine 으로, 이상점을 markPoint 로 낸다', () => {
    const opt = buildControlChartOption(
      {
        points: [
          { label: '1', value: 10, verdict: 'pass' },
          { label: '2', value: 12, verdict: 'warn' },
          { label: '3', value: 50, verdict: 'fail' },
        ],
        ucl: 15,
        lcl: 5,
        centerline: 10,
      },
      P,
    );
    const series = (opt.series as Record<string, unknown>[])[0];
    const markLine = series.markLine as { data: { name: string }[] };
    const names = markLine.data.map((d) => d.name);
    expect(names).toEqual(['UCL', 'LCL', 'CL']);
    const markPoint = series.markPoint as { data: unknown[] };
    expect(markPoint.data).toHaveLength(2); // warn + fail
  });

  it('한계가 없으면 markLine 이 비어도 동작', () => {
    const opt = buildControlChartOption({ points: [{ label: '1', value: 3 }] }, P);
    const series = (opt.series as Record<string, unknown>[])[0];
    expect((series.markLine as { data: unknown[] }).data).toHaveLength(0);
    expect((series.markPoint as { data: unknown[] }).data).toHaveLength(0);
  });
});

describe('buildHistogramOption', () => {
  it('값을 빈으로 집계한다', () => {
    const opt = buildHistogramOption({ values: [1, 1, 2, 2, 2, 3], bins: 3 }, P);
    const series = (opt.series as Record<string, unknown>[])[0];
    const data = series.data as number[];
    expect(data.reduce((a, b) => a + b, 0)).toBe(6); // 전체 관측 수 보존
  });
});
