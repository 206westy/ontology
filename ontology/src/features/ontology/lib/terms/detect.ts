// PRD-H (H4/M3): 미정의·모호 용어 감지(PURE). 생성 중 추출된 엔티티에서
// 해소가 필요한 용어를 배치로 모은다 — 건별 남발 금지, 중복 제거, 상한 캡.
// 트리거: (a) 정의 없는 약어(예 VV, EMO) (b) 저신뢰 타입 판정.

export interface DetectableEntity {
  name: string;
  type?: string | null;
  description?: string | null;
  // 타입 판정 신뢰도(0~1). 낮으면 모호로 간주.
  typeConfidence?: number | null;
}

// 약어 형태: 대문자로 시작하는 2~6자 대문자/숫자(VV, EMO, RF, PM10 …).
const ABBREVIATION_RE = /^[A-Z][A-Z0-9]{1,5}$/;
// 이 값 미만이면 타입 판정을 모호로 본다.
const LOW_TYPE_CONFIDENCE = 0.5;
// 배치 상한(검색 폭주·지연 방지).
const MAX_TERMS = 20;

function hasDefinition(entity: DetectableEntity): boolean {
  return !!entity.description && entity.description.trim().length > 0;
}

export function isAbbreviationLike(name: string): boolean {
  return ABBREVIATION_RE.test(name.trim());
}

function needsResolution(entity: DetectableEntity): boolean {
  const name = entity.name?.trim() ?? '';
  if (!name) return false;
  // 정의 없는 약어 → 모호.
  if (isAbbreviationLike(name) && !hasDefinition(entity)) return true;
  // 저신뢰 타입 판정 → 모호.
  if (entity.typeConfidence != null && entity.typeConfidence < LOW_TYPE_CONFIDENCE) {
    return true;
  }
  return false;
}

// 해소가 필요한 용어를 배치로 수집(대소문자 무시 중복 제거, 원문 유지, 상한 캡).
export function detectTermsNeedingResolution(
  entities: DetectableEntity[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entity of entities) {
    const name = entity.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    if (needsResolution(entity)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out.slice(0, MAX_TERMS);
}
