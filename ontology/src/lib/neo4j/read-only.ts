// H4: text2cypher 의 코드 레벨 read-only 강제. 프롬프트로만 "READ만"을 지시하면
// 환각/주입된 쓰기 절이 그대로 실행될 수 있다. 실행 전 이 가드로 쓰기 절을 차단한다.
const WRITE_CLAUSE_PATTERN =
  /\b(CREATE|MERGE|DELETE|SET|REMOVE|DROP|FOREACH)\b|\bLOAD\s+CSV\b/i;

/** 쓰기 절이 있으면 발견된 키워드를, 없으면 null 을 반환한다. */
export function findWriteClauseViolation(query: string): string | null {
  const match = query.match(WRITE_CLAUSE_PATTERN);
  return match ? match[0].toUpperCase().replace(/\s+/g, ' ') : null;
}
