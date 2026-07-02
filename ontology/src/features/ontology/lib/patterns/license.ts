import type { Pattern } from './types';

// PRD-H (T7/M1): 발행 전 라이선스 게이트(warn-only).
// 발견물(특히 LOV 검색)은 라이선스를 못 싣는 경우가 많다 → null/'unknown' 이면 미확인.
// 순수 술어 — 발행(Neo4j push) 확인 시 관련 패턴에 이 술어를 적용해 경고를 띄운다.

type LicensedLike = Pick<Pattern, 'license'>;

export function hasUnverifiedLicense(pattern: LicensedLike): boolean {
  const license = pattern.license?.trim().toLowerCase();
  return !license || license === 'unknown';
}

// 발행 대상 패턴 중 라이선스 미확인 목록(경고 문구 구성용).
export function unverifiedLicensePatterns<T extends LicensedLike>(
  patterns: T[],
): T[] {
  return patterns.filter(hasUnverifiedLicense);
}

// PRD-H T7 (M2): 발행 확인 시 보여줄 라이선스 경고 문구. 관련 패턴이 없거나 모두
// 라이선스가 확인되면 null(경고 없음). 발행을 막지 않는 warn-only 게이트.
export interface PublishPatternRef {
  name?: string | null;
  license: string | null;
}

export function buildPublishLicenseWarning(
  patterns: (PublishPatternRef | null | undefined)[],
): string | null {
  const involved = patterns.filter(
    (p): p is PublishPatternRef => p != null,
  );
  const unverified = involved.filter(hasUnverifiedLicense);
  if (unverified.length === 0) return null;
  const names = unverified
    .map((p) => p.name?.trim())
    .filter((n): n is string => !!n);
  const label = names.length ? ` (${names.join(', ')})` : '';
  return `이 생성에 사용된 패턴의 라이선스가 확인되지 않았습니다${label}. 발행 전에 출처·라이선스를 검토해 주세요.`;
}
