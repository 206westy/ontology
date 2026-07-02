import type { Pattern } from './types';

// PRD-H (H1/M1): 수렴(convergence)의 코어.
// 같은 도메인이 다시 들어오면 캐시된 최신(비-draft) 패턴을 재사용한다.
// DB 프리 순수 함수 — 라우트가 DB read 를 하고 이 함수로 선택한다.

export function selectCachedPattern(
  domain: string,
  patterns: Pattern[],
): Pattern | null {
  const matches = patterns.filter((p) => p.domain === domain && !p.isDraft);
  if (matches.length === 0) return null;
  // 도메인 내 최고 버전(수렴 시 항상 최신을 재사용).
  return matches.reduce((best, p) => (p.version > best.version ? p : best));
}

// 승격 시 다음 버전 번호(같은 key 의 max version + 1). 없으면 1.
export function nextPatternVersion(
  key: string,
  patterns: Pattern[],
): number {
  const versions = patterns
    .filter((p) => p.key === key)
    .map((p) => p.version);
  return versions.length === 0 ? 1 : Math.max(...versions) + 1;
}
