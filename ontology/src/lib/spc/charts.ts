// PRD-PF-F: 관리도 관리한계 산정. X-bar/R · I-MR(변량) · p/np/c/u(계수).
import { spcConst, MR_D2, I_MR_E2, MR_D4 } from './constants';
import { mean, sum } from './util';
import type { ControlLimitResult } from './types';

export function computeXbarR(subgroups: number[][]): ControlLimitResult {
  if (subgroups.length === 0) throw new Error('부분군 없음');
  const n = subgroups[0].length;
  if (n < 2) throw new Error('X-bar/R 은 부분군 크기 ≥2 필요(개별값은 I-MR 사용)');
  if (!subgroups.every((g) => g.length === n))
    throw new Error('부분군 크기 불균일');
  const c = spcConst(n);
  const means = subgroups.map(mean);
  const ranges = subgroups.map((g) => Math.max(...g) - Math.min(...g));
  const xbarbar = mean(means);
  const rbar = mean(ranges);
  return {
    chartType: 'xbar_r',
    centerline: xbarbar,
    ucl: xbarbar + c.a2 * rbar,
    lcl: xbarbar - c.a2 * rbar,
    centerlineSecondary: rbar,
    uclSecondary: c.d4 * rbar,
    lclSecondary: c.d3 * rbar,
    subgroupSize: n,
    sampleCount: subgroups.length,
    sigma: c.d2 > 0 ? rbar / c.d2 : 0,
  };
}

export function computeImr(values: number[]): ControlLimitResult {
  if (values.length < 2) throw new Error('I-MR 은 최소 2점 필요');
  const xbar = mean(values);
  const mr: number[] = [];
  for (let i = 1; i < values.length; i++)
    mr.push(Math.abs(values[i] - values[i - 1]));
  const mrbar = mean(mr);
  return {
    chartType: 'i_mr',
    centerline: xbar,
    ucl: xbar + I_MR_E2 * mrbar,
    lcl: xbar - I_MR_E2 * mrbar,
    centerlineSecondary: mrbar,
    uclSecondary: MR_D4 * mrbar,
    lclSecondary: 0,
    subgroupSize: 1,
    sampleCount: values.length,
    sigma: mrbar / MR_D2,
  };
}

export interface AttributeChart {
  limits: ControlLimitResult;
  series: number[];
  uclArr: number[]; // 계수형은 표본크기 가변 시 점별 한계.
  lclArr: number[];
}

function attrLimits(
  chartType: ControlLimitResult['chartType'],
  cl: number,
  ucl: number,
  lcl: number,
  subgroupSize: number,
  sampleCount: number,
  sigma: number,
): ControlLimitResult {
  return {
    chartType,
    centerline: cl,
    ucl,
    lcl,
    centerlineSecondary: null,
    uclSecondary: null,
    lclSecondary: null,
    subgroupSize,
    sampleCount,
    sigma,
  };
}

export function computeAttribute(
  chartType: 'p' | 'np' | 'c' | 'u',
  attr: { count: number; size: number }[],
): AttributeChart {
  if (attr.length === 0) throw new Error('데이터 없음');
  const k = attr.length;
  const totalCount = sum(attr.map((a) => a.count));
  const totalSize = sum(attr.map((a) => a.size));
  const nbar = totalSize / k;

  if (chartType === 'p') {
    const pbar = totalSize > 0 ? totalCount / totalSize : 0;
    const sig = (n: number) => (n > 0 ? Math.sqrt((pbar * (1 - pbar)) / n) : 0);
    const series = attr.map((a) => (a.size > 0 ? a.count / a.size : 0));
    const uclArr = attr.map((a) => pbar + 3 * sig(a.size));
    const lclArr = attr.map((a) => Math.max(0, pbar - 3 * sig(a.size)));
    return {
      limits: attrLimits('p', pbar, pbar + 3 * sig(nbar), Math.max(0, pbar - 3 * sig(nbar)), Math.round(nbar), k, sig(nbar)),
      series,
      uclArr,
      lclArr,
    };
  }
  if (chartType === 'np') {
    const n = attr[0].size;
    if (!attr.every((a) => a.size === n))
      throw new Error('np 관리도는 표본 크기 일정 필요');
    const pbar = n > 0 ? totalCount / (n * k) : 0;
    const npbar = n * pbar;
    const s = Math.sqrt(npbar * (1 - pbar));
    const series = attr.map((a) => a.count);
    const ucl = npbar + 3 * s;
    const lcl = Math.max(0, npbar - 3 * s);
    return {
      limits: attrLimits('np', npbar, ucl, lcl, n, k, s),
      series,
      uclArr: series.map(() => ucl),
      lclArr: series.map(() => lcl),
    };
  }
  if (chartType === 'c') {
    const cbar = totalCount / k;
    const s = Math.sqrt(cbar);
    const series = attr.map((a) => a.count);
    const ucl = cbar + 3 * s;
    const lcl = Math.max(0, cbar - 3 * s);
    return {
      limits: attrLimits('c', cbar, ucl, lcl, 1, k, s),
      series,
      uclArr: series.map(() => ucl),
      lclArr: series.map(() => lcl),
    };
  }
  // u
  const ubar = totalSize > 0 ? totalCount / totalSize : 0;
  const sig = (n: number) => (n > 0 ? Math.sqrt(ubar / n) : 0);
  const series = attr.map((a) => (a.size > 0 ? a.count / a.size : 0));
  const uclArr = attr.map((a) => ubar + 3 * sig(a.size));
  const lclArr = attr.map((a) => Math.max(0, ubar - 3 * sig(a.size)));
  return {
    limits: attrLimits('u', ubar, ubar + 3 * sig(nbar), Math.max(0, ubar - 3 * sig(nbar)), Math.round(nbar), k, sig(nbar)),
    series,
    uclArr,
    lclArr,
  };
}
