// PRD-PF-F M5: 신규 공정변수 → 관리도·룰셋 AI 초안. 결정론 코어(데이터 특성 기반).
// 최종 확정은 엔지니어(HITL). 결정론 우선 — 흔들리는 LLM 대신 재현 가능한 규칙.
import type { SpcChartType } from './types';

export interface VariableProfile {
  dataType?: 'continuous' | 'discrete' | 'proportion' | 'count' | 'unknown';
  hasSubgroups?: boolean;
  subgroupSize?: number;
  sampleValues?: number[];
  distinctCount?: number;
  name?: string;
  unit?: string;
}

export interface SpcSuggestion {
  chartType: SpcChartType;
  rulesEnabled: string[];
  rationale: string;
  confidence: number;
}

// PRD 기본: Western Electric 4룰(Nelson 은 과탐 우려로 기본 off).
const DEFAULT_RULESET = ['WE1', 'WE2', 'WE3', 'WE4'];

function inferKind(
  p: VariableProfile,
): 'continuous' | 'proportion' | 'count' | 'unknown' {
  if (p.dataType === 'proportion') return 'proportion';
  if (p.dataType === 'count') return 'count';
  if (p.dataType === 'continuous') return 'continuous';
  const vals = p.sampleValues ?? [];
  if (vals.length === 0) return 'unknown';
  const allInUnit = vals.every((v) => v >= 0 && v <= 1);
  const allNonNegInt = vals.every((v) => Number.isInteger(v) && v >= 0);
  if (allInUnit && !vals.every((v) => v === 0 || v === 1)) return 'proportion';
  if (allNonNegInt) return 'count';
  return 'continuous';
}

export function suggestSpc(p: VariableProfile): SpcSuggestion {
  const kind = inferKind(p);
  if (kind === 'proportion') {
    return {
      chartType: 'p',
      rulesEnabled: DEFAULT_RULESET,
      confidence: 0.7,
      rationale: '값이 0~1 비율 → 부적합률(p) 관리도 권장.',
    };
  }
  if (kind === 'count') {
    return {
      chartType: 'c',
      rulesEnabled: DEFAULT_RULESET,
      confidence: 0.65,
      rationale: '값이 음이 아닌 정수(결점/부적합수) → c 관리도 권장.',
    };
  }
  if (kind === 'continuous') {
    if (p.hasSubgroups && (p.subgroupSize ?? 0) >= 2) {
      return {
        chartType: 'xbar_r',
        rulesEnabled: DEFAULT_RULESET,
        confidence: 0.75,
        rationale: `연속형·부분군(n=${p.subgroupSize}) → X-bar/R 관리도 권장.`,
      };
    }
    return {
      chartType: 'i_mr',
      rulesEnabled: DEFAULT_RULESET,
      confidence: 0.7,
      rationale: '연속형·개별 측정 → I-MR 관리도 권장.',
    };
  }
  return {
    chartType: 'i_mr',
    rulesEnabled: DEFAULT_RULESET,
    confidence: 0.4,
    rationale: '데이터 특성이 불충분 → 기본 I-MR 제시(엔지니어 확정 필요).',
  };
}
