// PRD-PF-F: 공정능력지수. Cp/Cpk(부분군내 σ) · Pp/Ppk(전체 σ). 한쪽 스펙만 있으면 해당 쪽만.
import { mean, stddev } from './util';
import type { CapabilityResult, SpcSpec } from './types';

function minDefined(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

export function computeCapability(
  values: number[],
  spec: SpcSpec,
  sigmaWithin: number,
): CapabilityResult {
  const m = mean(values);
  const sigmaOverall = stddev(values);
  const usl = spec.usl ?? null;
  const lsl = spec.lsl ?? null;
  const both = usl != null && lsl != null;

  const cp = both && sigmaWithin > 0 ? (usl - lsl) / (6 * sigmaWithin) : null;
  const pp = both && sigmaOverall > 0 ? (usl - lsl) / (6 * sigmaOverall) : null;

  const cpkU = usl != null && sigmaWithin > 0 ? (usl - m) / (3 * sigmaWithin) : null;
  const cpkL = lsl != null && sigmaWithin > 0 ? (m - lsl) / (3 * sigmaWithin) : null;
  const ppkU = usl != null && sigmaOverall > 0 ? (usl - m) / (3 * sigmaOverall) : null;
  const ppkL = lsl != null && sigmaOverall > 0 ? (m - lsl) / (3 * sigmaOverall) : null;

  return {
    cp,
    cpk: minDefined(cpkU, cpkL),
    pp,
    ppk: minDefined(ppkU, ppkL),
    mean: m,
    sigmaWithin,
    sigmaOverall,
  };
}
