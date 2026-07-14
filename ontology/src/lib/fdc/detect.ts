// PRD-PF-F M4: FDC 단변량 이상탐지 — (a) 임계값, (b) 트렌드(급변·드리프트).
// 다변량(PCA 등)은 스코프 밖(8절 불가기능). 순수 함수·인프로세스.
export type FdcMethod = 'threshold' | 'trend';

export interface FdcThresholdInput {
  values: number[];
  upper?: number | null;
  lower?: number | null;
}

export interface FdcTrendInput {
  values: number[];
  jumpThreshold?: number | null; // 연속 차분 급변 임계
  driftSlopeThreshold?: number | null; // 최근 window 최소제곱 기울기 임계
  window?: number;
}

export interface FdcResult {
  method: FdcMethod;
  faultFlag: boolean;
  score: number; // 이상 강도(초과량 또는 |기울기|/급변폭)
  violatingIndices: number[];
  detail: Record<string, unknown>;
}

export function detectThreshold(input: FdcThresholdInput): FdcResult {
  const upper = input.upper ?? null;
  const lower = input.lower ?? null;
  const violating: number[] = [];
  let maxExceed = 0;
  input.values.forEach((v, i) => {
    let ex = 0;
    if (upper != null && v > upper) ex = Math.max(ex, v - upper);
    if (lower != null && v < lower) ex = Math.max(ex, lower - v);
    if (ex > 0) {
      violating.push(i);
      maxExceed = Math.max(maxExceed, ex);
    }
  });
  return {
    method: 'threshold',
    faultFlag: violating.length > 0,
    score: maxExceed,
    violatingIndices: violating,
    detail: { upper, lower },
  };
}

/** 최소제곱 기울기(등간격 x=0..n-1). */
function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xm = (n - 1) / 2;
  const ym = values.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xm) * (values[i] - ym);
    den += (i - xm) ** 2;
  }
  return den > 0 ? num / den : 0;
}

export function detectTrend(input: FdcTrendInput): FdcResult {
  const jumpT = input.jumpThreshold ?? null;
  const driftT = input.driftSlopeThreshold ?? null;
  const win = input.window ?? input.values.length;
  const violating: number[] = [];
  let maxJump = 0;

  for (let i = 1; i < input.values.length; i++) {
    const d = Math.abs(input.values[i] - input.values[i - 1]);
    maxJump = Math.max(maxJump, d);
    if (jumpT != null && d > jumpT) violating.push(i);
  }

  const recent = input.values.slice(Math.max(0, input.values.length - win));
  const sl = slope(recent);
  const driftFault = driftT != null && Math.abs(sl) > driftT;
  const jumpFault = jumpT != null && violating.length > 0;
  const score = Math.max(
    driftT != null ? Math.abs(sl) : 0,
    jumpT != null ? maxJump : 0,
  );

  return {
    method: 'trend',
    faultFlag: driftFault || jumpFault,
    score,
    violatingIndices: [...new Set(violating)],
    detail: { slope: sl, maxJump, driftFault, jumpFault },
  };
}
