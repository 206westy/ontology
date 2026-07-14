import { NODE_CSS_VARS } from '../../ontology/constants/colors';
import type { PatternVisibility } from '../../ontology/lib/patterns/types';

// PRD-BM-D01 (M1): 마켓플레이스 시각 헬퍼. 하드코딩 팔레트 금지 — 전부 디자인 토큰(CSS 변수)에서.

const NODE_KEYS = Object.keys(NODE_CSS_VARS) as (keyof typeof NODE_CSS_VARS)[];

/** 도메인 문자열 → 보라 램프 노드색(CSS 변수). 같은 도메인은 항상 같은 색(결정적 해시). */
export function domainColorVar(domain: string): string {
  let hash = 0;
  for (let i = 0; i < domain.length; i += 1) {
    hash = (hash * 31 + domain.charCodeAt(i)) >>> 0;
  }
  const key = NODE_KEYS[hash % NODE_KEYS.length];
  return `hsl(var(${NODE_CSS_VARS[key].border}))`;
}

/** 헬스 점수 → semantic 토큰 클래스(HealthScoreBadge 와 동일 규칙). */
export function healthTone(score: number | null | undefined): string {
  if (score == null) return 'border-border text-muted-foreground';
  if (score >= 80) return 'border-success text-success';
  if (score >= 50) return 'border-warning text-warning';
  return 'border-destructive text-destructive';
}

export const VISIBILITY_LABEL: Record<PatternVisibility, string> = {
  private: '비공개',
  org: '조직 공유',
  public: '공개',
};

/** method → 사람이 읽는 출처 유형. */
export function methodLabel(method: string): string {
  switch (method) {
    case 'retrieved':
      return '검색';
    case 'adapted':
      return '적응';
    case 'synthesized':
      return '합성';
    case 'bootstrap':
      return '기본';
    default:
      return method;
  }
}
