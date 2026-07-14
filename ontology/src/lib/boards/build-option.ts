// PRD-PF-G: 라이브러리 중립 위젯 → ECharts option 어댑터(렌더러 교체 가능하게 분리).
// 순수 함수 — echarts 타입 비의존(option 은 plain object). 관리도 UCL/LCL=markLine, 이상점=markPoint.

export interface Palette {
  line: string;
  marker: string;
  warn: string;
  fail: string;
  limit: string;
  center: string;
  text: string;
  axis: string;
  grid: string;
}

export type PointVerdict = 'pass' | 'warn' | 'fail';
export interface ControlPoint {
  label: string;
  value: number;
  verdict?: PointVerdict;
}
export interface ControlChartInput {
  points: ControlPoint[];
  ucl?: number | null;
  lcl?: number | null;
  centerline?: number | null;
  yLabel?: string;
}

const BASE_GRID = { left: 52, right: 16, top: 24, bottom: 32 };

export function buildControlChartOption(
  input: ControlChartInput,
  p: Palette,
): Record<string, unknown> {
  const x = input.points.map((pt) => pt.label);
  const y = input.points.map((pt) => pt.value);
  const flagged = input.points
    .map((pt, i) =>
      pt.verdict && pt.verdict !== 'pass'
        ? {
            coord: [i, pt.value],
            itemStyle: { color: pt.verdict === 'fail' ? p.fail : p.warn },
          }
        : null,
    )
    .filter((v): v is { coord: number[]; itemStyle: { color: string } } => v !== null);

  const markLineData: Record<string, unknown>[] = [];
  if (input.ucl != null)
    markLineData.push({ yAxis: input.ucl, name: 'UCL', lineStyle: { color: p.limit, type: 'dashed' } });
  if (input.lcl != null)
    markLineData.push({ yAxis: input.lcl, name: 'LCL', lineStyle: { color: p.limit, type: 'dashed' } });
  if (input.centerline != null)
    markLineData.push({ yAxis: input.centerline, name: 'CL', lineStyle: { color: p.center } });

  return {
    grid: BASE_GRID,
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: x, axisLine: { lineStyle: { color: p.axis } } },
    yAxis: {
      type: 'value',
      name: input.yLabel ?? '',
      axisLine: { lineStyle: { color: p.axis } },
      splitLine: { lineStyle: { color: p.grid } },
    },
    series: [
      {
        type: 'line',
        data: y,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: p.line },
        itemStyle: { color: p.marker },
        markLine: { symbol: 'none', data: markLineData, label: { formatter: '{b}' } },
        markPoint: { symbolSize: 16, data: flagged },
      },
    ],
  };
}

export interface TrendInput {
  points: { label: string; value: number }[];
  yLabel?: string;
}
export function buildTrendOption(input: TrendInput, p: Palette): Record<string, unknown> {
  return {
    grid: BASE_GRID,
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: input.points.map((d) => d.label), axisLine: { lineStyle: { color: p.axis } } },
    yAxis: { type: 'value', name: input.yLabel ?? '', splitLine: { lineStyle: { color: p.grid } } },
    series: [
      { type: 'line', smooth: true, data: input.points.map((d) => d.value), lineStyle: { color: p.line }, itemStyle: { color: p.marker }, areaStyle: { opacity: 0.06 } },
    ],
  };
}

export interface HistogramInput {
  values: number[];
  bins?: number;
  yLabel?: string;
}
export function buildHistogramOption(input: HistogramInput, p: Palette): Record<string, unknown> {
  const values = input.values;
  const bins = Math.max(1, input.bins ?? 10);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = max > min ? (max - min) / bins : 1;
  const counts = new Array(bins).fill(0);
  const labels: string[] = [];
  for (let i = 0; i < bins; i++) labels.push((min + i * width).toFixed(1));
  for (const v of values) {
    const idx = width > 0 ? Math.min(bins - 1, Math.floor((v - min) / width)) : 0;
    counts[idx] += 1;
  }
  return {
    grid: BASE_GRID,
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: p.axis } } },
    yAxis: { type: 'value', name: input.yLabel ?? '빈도', splitLine: { lineStyle: { color: p.grid } } },
    series: [{ type: 'bar', data: counts, itemStyle: { color: p.marker } }],
  };
}
