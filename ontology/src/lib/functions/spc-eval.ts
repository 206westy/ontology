// PRD-PF-F: kinetic Function(impl_type='spc') 평가 — 인스턴스 측정 시퀀스를 관리도로 판정.
// 순수(부작용 없음). DB 적재는 라우트가 담당. 통계는 lib/spc(엔진)에 위임.
import { evaluateSpc } from '@/lib/spc';
import type {
  ControlLimitResult,
  SpcPoint,
  SpcResult,
  SpcSpec,
  SpcVerdict,
} from '@/lib/spc/types';
import { hashInput } from './evaluate';

export interface OrderedMeasurement {
  instanceId: string;
  value: number;
}

export interface SpcFnConfig {
  chartType: 'xbar_r' | 'i_mr';
  subgroupSize?: number;
  spec?: SpcSpec | null;
  rulesEnabled?: string[];
  providedLimits?: Partial<ControlLimitResult> | null;
}

export interface SpcRunRow {
  instanceId: string | null;
  lotId: string | null;
  verdict: SpcVerdict;
  violatedRules: string[];
  evidence: Record<string, unknown>;
}

export interface DecisionRow {
  instanceId: string;
  verdict: Record<string, unknown>;
  inputSnapshot: Record<string, number>;
  inputHash: string;
}

export interface SpcFnResult {
  spcResult: SpcResult;
  runRows: SpcRunRow[];
  decisionRows: DecisionRow[];
}

const LABEL: Record<SpcVerdict, string> = {
  pass: '통과',
  warn: '경고',
  fail: '불통과',
};

function evidenceOf(p: SpcPoint, limits: ControlLimitResult): Record<string, unknown> {
  return {
    value: p.value,
    secondary: p.secondary,
    sigmaDistance: p.sigmaDistance,
    zone: p.zone,
    ucl: limits.ucl,
    lcl: limits.lcl,
    centerline: limits.centerline,
  };
}

function toDecisionRow(
  instanceId: string,
  p: SpcPoint,
  limits: ControlLimitResult,
  chartType: string,
): DecisionRow {
  const snapshot = {
    value: p.value,
    ucl: limits.ucl,
    lcl: limits.lcl,
    centerline: limits.centerline,
  };
  return {
    instanceId,
    verdict: {
      kind: 'pass_fail',
      pass: p.verdict === 'pass',
      label: LABEL[p.verdict],
      raw: p.value,
      spc: {
        verdict: p.verdict,
        sigmaDistance: p.sigmaDistance,
        zone: p.zone,
        violatedRules: p.violatedRules,
        chartType,
      },
    },
    inputSnapshot: snapshot,
    inputHash: hashInput(snapshot),
  };
}

export function evaluateSpcFunction(
  measurements: OrderedMeasurement[],
  cfg: SpcFnConfig,
): SpcFnResult {
  if (measurements.length < 2) {
    throw new Error('SPC 판정에는 최소 2개 측정값이 필요합니다.');
  }

  if (cfg.chartType === 'i_mr') {
    const spcResult = evaluateSpc({
      chartType: 'i_mr',
      values: measurements.map((m) => m.value),
      spec: cfg.spec,
      rulesEnabled: cfg.rulesEnabled,
      providedLimits: cfg.providedLimits,
    });
    const runRows: SpcRunRow[] = spcResult.points.map((p, i) => ({
      instanceId: measurements[i].instanceId,
      lotId: null,
      verdict: p.verdict,
      violatedRules: p.violatedRules,
      evidence: evidenceOf(p, spcResult.limits),
    }));
    const decisionRows = spcResult.points.map((p, i) =>
      toDecisionRow(measurements[i].instanceId, p, spcResult.limits, 'i_mr'),
    );
    return { spcResult, runRows, decisionRows };
  }

  // xbar_r: 순서대로 부분군으로 묶음(합리적 부분군의 기본 근사 = 연속 n개).
  const n = cfg.subgroupSize ?? 5;
  const subgroups: number[][] = [];
  const rep: string[] = [];
  for (let i = 0; i + n <= measurements.length; i += n) {
    subgroups.push(measurements.slice(i, i + n).map((m) => m.value));
    rep.push(measurements[i + n - 1].instanceId);
  }
  if (subgroups.length === 0) {
    throw new Error(`X-bar/R: 측정값이 부분군 크기(${n})보다 적습니다.`);
  }
  const spcResult = evaluateSpc({
    chartType: 'xbar_r',
    subgroups,
    spec: cfg.spec,
    rulesEnabled: cfg.rulesEnabled,
    providedLimits: cfg.providedLimits,
  });
  const runRows: SpcRunRow[] = spcResult.points.map((p, i) => ({
    instanceId: rep[i],
    lotId: `subgroup-${i + 1}`,
    verdict: p.verdict,
    violatedRules: p.violatedRules,
    evidence: evidenceOf(p, spcResult.limits),
  }));
  const decisionRows = spcResult.points.map((p, i) =>
    toDecisionRow(rep[i], p, spcResult.limits, 'xbar_r'),
  );
  return { spcResult, runRows, decisionRows };
}
