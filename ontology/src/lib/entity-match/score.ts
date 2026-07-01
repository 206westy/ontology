// H5: 엔티티 매칭 점수를 한 곳에서 정의한다. 엔드포인트마다 다른 결합식을 쓰면
// 같은 데이터에 모순된 중복 후보 순위가 나와 병합 일관성이 깨진다.
//
// 두 신호는 서로 분포가 다르다:
//  - vectorScore: pgvector 코사인 유사도(보통 0.7~0.95에 몰림)
//  - trigramScore: pg_trgm 유사도(보통 0.3~0.6)
// 단순 Math.max 는 vector 쪽으로 편향된다 → 가중 결합으로 두 신호를 함께 반영한다.

export const MATCH_VECTOR_WEIGHT = 0.6;
export const MATCH_TRIGRAM_WEIGHT = 0.4;

/** 이 값 이상이면 "유사 후보"로 본다(엔드포인트 공통 임계값). */
export const MATCH_CANDIDATE_THRESHOLD = 0.5;

/**
 * 코사인(vec)과 trigram 점수를 [0,1] 가중 결합한다.
 * 한쪽 신호만 있으면 그 신호를 그대로 사용한다.
 */
export function combinedMatchScore(
  vectorScore: number | null | undefined,
  trigramScore: number | null | undefined,
): number {
  const vec = vectorScore ?? null;
  const trg = trigramScore ?? null;

  if (vec !== null && trg !== null) {
    return MATCH_VECTOR_WEIGHT * vec + MATCH_TRIGRAM_WEIGHT * trg;
  }
  if (vec !== null) return vec;
  if (trg !== null) return trg;
  return 0;
}
