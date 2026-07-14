// PRD-PF-F: SPC 엔진 오케스트레이터. 관리한계 → 점별 σ거리 → 룰 판정 → 능력지수 → verdict.
// 순수 함수(부작용 없음). DB 적재는 라우트가 담당(엔진↔온톨로지 경계).
import { computeXbarR, computeImr, computeAttribute } from './charts';
import { computeCapability } from './capability';
import { evaluateRules, ruleSeverity, zoneOf, DEFAULT_RULES } from './rules';
import { uniq } from './util';
import type {
  ControlLimitResult,
  SpcInput,
  SpcPoint,
  SpcResult,
  SpcVerdict,
} from './types';

export * from './types';
export { DEFAULT_RULES, WESTERN_ELECTRIC, NELSON } from './rules';
export { spcConst, isSubgroupSizeSupported } from './constants';
export { computeCapability } from './capability';
export { computeXbarR, computeImr, computeAttribute } from './charts';

function worst(vs: SpcVerdict[]): SpcVerdict {
  if (vs.includes('fail')) return 'fail';
  if (vs.includes('warn')) return 'warn';
  return 'pass';
}

/** 중심선 기준 부호 있는 σ 거리(비대칭 한계=계수형 하한 0 지원). */
function sigmaDistance(v: number, cl: number, ucl: number, lcl: number): number {
  if (v >= cl) {
    const s = (ucl - cl) / 3;
    return s > 0 ? (v - cl) / s : 0;
  }
  const s = (cl - lcl) / 3;
  return s > 0 ? (v - cl) / s : 0;
}

export function evaluateSpc(input: SpcInput): SpcResult {
  const enabled =
    input.rulesEnabled && input.rulesEnabled.length
      ? input.rulesEnabled
      : DEFAULT_RULES;

  let limits: ControlLimitResult;
  let series: number[];
  let uclArr: number[] = [];
  let lclArr: number[] = [];
  let secondary: number[] | null = null;
  let secondaryUcl: number | null = null;
  let secondaryLcl: number | null = null;
  let capabilityValues: number[] | null = null;

  if (input.chartType === 'xbar_r') {
    const sg = input.subgroups ?? [];
    limits = computeXbarR(sg);
    series = sg.map((g) => g.reduce((s, x) => s + x, 0) / g.length);
    secondary = sg.map((g) => Math.max(...g) - Math.min(...g));
    secondaryUcl = limits.uclSecondary ?? null;
    secondaryLcl = limits.lclSecondary ?? null;
    capabilityValues = sg.flat();
  } else if (input.chartType === 'i_mr') {
    const vals = input.values ?? [];
    limits = computeImr(vals);
    series = vals;
    const mr: number[] = [0];
    for (let i = 1; i < vals.length; i++) mr.push(Math.abs(vals[i] - vals[i - 1]));
    secondary = mr;
    secondaryUcl = limits.uclSecondary ?? null;
    secondaryLcl = limits.lclSecondary ?? null;
    capabilityValues = vals;
  } else {
    const a = computeAttribute(input.chartType, input.attribute ?? []);
    limits = a.limits;
    series = a.series;
    uclArr = a.uclArr;
    lclArr = a.lclArr;
  }

  // 변량 관리도: 엔지니어 확정 한계가 있으면 재계산 대신 사용(자동 재계산 금지 정책).
  if (input.chartType === 'xbar_r' || input.chartType === 'i_mr') {
    const pl = input.providedLimits;
    if (pl && pl.centerline != null && pl.ucl != null && pl.lcl != null) {
      limits = {
        ...limits,
        centerline: pl.centerline,
        ucl: pl.ucl,
        lcl: pl.lcl,
        sigma: pl.sigma ?? limits.sigma,
      };
    }
    uclArr = series.map(() => limits.ucl);
    lclArr = series.map(() => limits.lcl);
  }

  const points: SpcPoint[] = series.map((v, i) => {
    const sd = sigmaDistance(v, limits.centerline, uclArr[i], lclArr[i]);
    return {
      index: i,
      value: v,
      secondary: secondary ? secondary[i] : null,
      sigmaDistance: sd,
      zone: zoneOf(sd),
      verdict: 'pass' as SpcVerdict,
      violatedRules: [],
    };
  });

  const hits = evaluateRules(
    points.map((p) => p.sigmaDistance),
    enabled,
  );
  for (const [i, rules] of hits) {
    points[i].violatedRules = rules.slice();
    points[i].verdict = ruleSeverity(rules);
  }

  // 보조 관리도(범위/이동범위) 관리이탈 → 산포 이상(fail).
  if (secondary && secondaryUcl != null) {
    points.forEach((p, i) => {
      if (i === 0 && input.chartType === 'i_mr') return; // 첫 이동범위 없음
      const s = secondary![i];
      if (s > secondaryUcl! || (secondaryLcl != null && s < secondaryLcl)) {
        if (!p.violatedRules.includes('RANGE')) p.violatedRules.push('RANGE');
        p.verdict = 'fail';
      }
    });
  }

  const capability =
    capabilityValues && input.spec
      ? computeCapability(capabilityValues, input.spec, limits.sigma)
      : null;

  return {
    chartType: input.chartType,
    limits,
    points,
    capability,
    verdict: worst(points.map((p) => p.verdict)),
    violatedRuleSummary: uniq(points.flatMap((p) => p.violatedRules)),
  };
}
