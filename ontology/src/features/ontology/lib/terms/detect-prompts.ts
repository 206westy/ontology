import type { DetectableEntity } from './detect';

// PRD-H (H4/M3): 용어 감지 프롬프트(mini). 순수 휴리스틱 detect.ts 로 1차 배치하고,
// 애매한 경우 경량 모델로 "이 용어가 이 도메인에서 미정의·모호한가"만 판정한다(추출 아님).
export function buildDetectSystem(): string {
  return `너는 온톨로지 용어 감지기다. 주어진 용어 목록에서 이 도메인에서 미정의·모호(약어·은어·저신뢰 타입)한 것만 골라라.
- 이미 도메인에서 명확한 일반 용어는 제외한다.
- 추출·정의는 하지 않는다. "해소가 필요한 용어"만 배치로 고른다.`;
}

export function buildDetectUser(
  domain: string,
  entities: DetectableEntity[],
): string {
  const list = entities
    .map((e) => {
      const def = e.description?.trim() ? ` (정의: ${e.description.trim()})` : ' (정의 없음)';
      return `- ${e.name}${def}`;
    })
    .join('\n');
  return `도메인: ${domain}
용어 후보:
${list}

해소가 필요한(미정의·모호) 용어만 골라라.`;
}
