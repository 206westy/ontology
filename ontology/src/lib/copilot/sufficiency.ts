// PRD-PF-E M3: 데이터 충분성 진단(결정론 우선). 도메인 템플릿의 필수 컬럼 매트릭스 대비
// 실제 컬럼을 매칭한다. LLM 은 이 결정론 결과의 '미매칭' 항목에 대한 의미 매칭 보조만 담당.

import type { DomainTemplate } from './templates';

export type Verdict = '충분' | '부족' | '모름';

export interface RequiredColumnResult {
  role: string;
  present: boolean;
  matchedTo: string | null;
  why: string;
  howToGet: string;
}

export interface SufficiencyResult {
  problemType: string;
  verdict: Verdict;
  score: number; // 0~100
  requiredColumns: RequiredColumnResult[];
  missing: { what: string; why: string; howToGet: string }[];
  evidence: string[];
}

const SUFFICIENT_THRESHOLD = 80;

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s_\-]/g, '');
}

/** 컬럼명이 필수역의 동의어와 매칭되는가(양방향 substring, 정규화). */
function matchColumn(columnNames: string[], role: string, synonyms: string[]): string | null {
  const keys = [role, ...synonyms].map(norm);
  for (const col of columnNames) {
    const c = norm(col);
    if (c.length === 0) continue;
    for (const k of keys) {
      if (k.length === 0) continue;
      if (c.includes(k) || k.includes(c)) return col;
    }
  }
  return null;
}

/**
 * 결정론 충분성 채점. columnNames 가 비면 verdict='모름'(데이터 실측 없이 단정 금지).
 */
export function scoreSufficiency(
  template: DomainTemplate,
  columnNames: string[],
): SufficiencyResult {
  if (columnNames.length === 0) {
    return {
      problemType: template.type,
      verdict: '모름',
      score: 0,
      requiredColumns: template.requiredColumns.map((rc) => ({
        role: rc.role,
        present: false,
        matchedTo: null,
        why: rc.why,
        howToGet: rc.howToGet,
      })),
      missing: [],
      evidence: ['연결된 데이터셋의 컬럼이 없어 판단할 수 없습니다.'],
    };
  }

  const results: RequiredColumnResult[] = template.requiredColumns.map((rc) => {
    const matchedTo = matchColumn(columnNames, rc.role, rc.synonyms);
    return {
      role: rc.role,
      present: matchedTo !== null,
      matchedTo,
      why: rc.why,
      howToGet: rc.howToGet,
    };
  });

  const total = results.length;
  const matched = results.filter((r) => r.present).length;
  const score = total > 0 ? Math.round((matched / total) * 100) : 0;
  const verdict: Verdict = score >= SUFFICIENT_THRESHOLD ? '충분' : '부족';

  return {
    problemType: template.type,
    verdict,
    score,
    requiredColumns: results,
    missing: results
      .filter((r) => !r.present)
      .map((r) => ({ what: r.role, why: r.why, howToGet: r.howToGet })),
    evidence: results
      .filter((r) => r.present)
      .map((r) => `${r.role} ← "${r.matchedTo}"`),
  };
}
