// PRD-PF-F: kinetic Function(impl_type='fdc') 평가 — 센서 시퀀스를 단변량 이상탐지로 판정.
// 순수. DB 적재는 라우트가 담당. 탐지는 lib/fdc(엔진)에 위임.
import { detectThreshold, detectTrend, type FdcResult } from '@/lib/fdc/detect';
import { hashInput } from './evaluate';

export interface OrderedMeasurement {
  instanceId: string;
  value: number;
}

export interface FdcFnConfig {
  method: 'threshold' | 'trend';
  params: {
    upper?: number | null;
    lower?: number | null;
    jumpThreshold?: number | null;
    driftSlopeThreshold?: number | null;
    window?: number;
  };
}

export interface FdcDecisionRow {
  instanceId: string;
  verdict: Record<string, unknown>;
  inputSnapshot: Record<string, number>;
  inputHash: string;
}

export interface FdcFnResult {
  result: FdcResult;
  decisionRows: FdcDecisionRow[];
  faultInstanceIds: string[];
}

export function evaluateFdcFunction(
  measurements: OrderedMeasurement[],
  cfg: FdcFnConfig,
): FdcFnResult {
  const values = measurements.map((m) => m.value);
  const result =
    cfg.method === 'threshold'
      ? detectThreshold({
          values,
          upper: cfg.params.upper ?? null,
          lower: cfg.params.lower ?? null,
        })
      : detectTrend({
          values,
          jumpThreshold: cfg.params.jumpThreshold ?? null,
          driftSlopeThreshold: cfg.params.driftSlopeThreshold ?? null,
          window: cfg.params.window,
        });

  // 점별 이상: 임계값=초과 인덱스, 트렌드=급변 인덱스 + 드리프트 시 마지막 점(대표).
  const faultIdx = new Set(result.violatingIndices);
  if (
    cfg.method === 'trend' &&
    (result.detail as { driftFault?: boolean }).driftFault &&
    measurements.length > 0
  ) {
    faultIdx.add(measurements.length - 1);
  }

  const faultInstanceIds: string[] = [];
  const decisionRows = measurements.map((m, i) => {
    const isFault = faultIdx.has(i);
    if (isFault) faultInstanceIds.push(m.instanceId);
    const snapshot = { value: m.value };
    return {
      instanceId: m.instanceId,
      verdict: {
        kind: 'pass_fail',
        pass: !isFault,
        label: isFault ? '이상' : '정상',
        raw: m.value,
        fdc: {
          method: result.method,
          faultFlag: isFault,
          score: result.score,
        },
      },
      inputSnapshot: snapshot,
      inputHash: hashInput(snapshot),
    };
  });

  return { result, decisionRows, faultInstanceIds };
}
