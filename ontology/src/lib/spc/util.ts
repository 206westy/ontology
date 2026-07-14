// PRD-PF-F: SPC 순수 수치 유틸(런타임 무관·테스트 가능).
export function sum(a: number[]): number {
  return a.reduce((s, x) => s + x, 0);
}

export function mean(a: number[]): number {
  if (a.length === 0) throw new Error('빈 배열의 평균');
  return sum(a) / a.length;
}

/** 표본 표준편차(n-1, 전체 산포=Pp/Ppk용). */
export function stddev(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  const v = sum(a.map((x) => (x - m) ** 2)) / (a.length - 1);
  return Math.sqrt(v);
}

export function uniq<T>(a: T[]): T[] {
  return [...new Set(a)];
}
