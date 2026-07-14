import type { Pattern } from './types';

// PRD-BM-D01 (M2-5): 마켓플레이스 큐레이션(순수). Critic 철학의 마켓플레이스 적용.
// 임계 이하(저품질) 패턴을 숨기지 않고 dim + 하단으로 밀어 신뢰 가능한 패턴을 먼저 보이게 한다.
// 투명성 원칙: 완전 제거하지 않는다(사용자가 여전히 볼 수 있음).

export interface CurationThresholds {
  /** 사용빈도 최소치(0=비활성 — 신규 패턴을 벌하지 않음). */
  minOccurrence: number;
  /** 헬스 최소치(발행돼 health 가 산정된 패턴에만 적용). */
  minHealth: number;
}

export const DEFAULT_CURATION: CurationThresholds = {
  minOccurrence: 0,
  minHealth: 50,
};

export interface CuratedPattern {
  pattern: Pattern;
  dimmed: boolean;
}

function isBelowThreshold(pattern: Pattern, t: CurationThresholds): boolean {
  // health 는 산정된(발행) 패턴에만 적용 — 미산정(null)은 헬스로 벌하지 않는다.
  const belowHealth = pattern.health != null && pattern.health < t.minHealth;
  const belowOcc = t.minOccurrence > 0 && pattern.occurrenceCount < t.minOccurrence;
  return belowHealth || belowOcc;
}

/** 임계 이하는 dim + 하단으로(안정 정렬으로 그룹 내 원 순서 유지). */
export function curatePatterns(
  patterns: Pattern[],
  thresholds: CurationThresholds = DEFAULT_CURATION,
): CuratedPattern[] {
  const scored = patterns.map((pattern) => ({
    pattern,
    dimmed: isBelowThreshold(pattern, thresholds),
  }));
  // 안정 정렬: dimmed=false 먼저. (index 로 tie-break 해 원 순서 보존.)
  return scored
    .map((c, index) => ({ ...c, index }))
    .sort((a, b) => Number(a.dimmed) - Number(b.dimmed) || a.index - b.index)
    .map(({ pattern, dimmed }) => ({ pattern, dimmed }));
}

/** 편의: 큐레이션 결과에서 dim 된 id 집합. */
export function dimmedIdSet(curated: CuratedPattern[]): Set<string> {
  return new Set(curated.filter((c) => c.dimmed).map((c) => c.pattern.id));
}
