// PRD-PF-F: SPC 엔진 공용 타입.
// 원칙 — 통계 계산은 lib/spc(순수·인프로세스)에만. 그래프/Cypher/온톨로지에는 통계식 하드코딩 금지.
export type SpcChartType = 'xbar_r' | 'i_mr' | 'p' | 'np' | 'c' | 'u';
export type SpcVerdict = 'pass' | 'warn' | 'fail';

export interface SpcSpec {
  usl?: number | null;
  lsl?: number | null;
  target?: number | null;
}

export interface ControlLimitResult {
  chartType: SpcChartType;
  centerline: number;
  ucl: number;
  lcl: number;
  // 보조 관리도(R/MR) 한계 — 변량 관리도에서만.
  centerlineSecondary?: number | null;
  uclSecondary?: number | null;
  lclSecondary?: number | null;
  subgroupSize: number;
  sampleCount: number;
  // 부분군내 σ 추정치(능력지수·존 계산용).
  sigma: number;
}

export interface SpcPoint {
  index: number;
  value: number;
  secondary?: number | null;
  sigmaDistance: number; // 중심선 기준 부호 있는 σ 거리
  zone: string; // 'C+','B-','A+','beyond-' ...
  verdict: SpcVerdict;
  violatedRules: string[];
}

export interface CapabilityResult {
  cp: number | null;
  cpk: number | null;
  pp: number | null;
  ppk: number | null;
  mean: number;
  sigmaWithin: number;
  sigmaOverall: number;
}

export interface SpcInput {
  chartType: SpcChartType;
  subgroups?: number[][]; // xbar_r
  values?: number[]; // i_mr
  attribute?: { count: number; size: number }[]; // p/np/c/u (count=부적합수/결점수, size=표본크기)
  spec?: SpcSpec | null;
  rulesEnabled?: string[];
  // 엔지니어가 확정한 관리한계(자동 재계산 금지 정책 지원 — 있으면 재계산 대신 사용).
  providedLimits?: Partial<ControlLimitResult> | null;
}

export interface SpcResult {
  chartType: SpcChartType;
  limits: ControlLimitResult;
  points: SpcPoint[];
  capability: CapabilityResult | null;
  verdict: SpcVerdict;
  violatedRuleSummary: string[];
}
