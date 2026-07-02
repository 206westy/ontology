import type { DriftElement, DriftPatternContext } from './drift';

// PRD-H (H5/M4): 스키마 드리프트 판정 프롬프트(primary). 도메인 + 현재 패턴 맥락
// (역할·관계)을 반드시 주입해 신규 요소가 기존에 정렬되는지(map) / 도메인 내부 확장인지
// (extend) / 다른 도메인이라 분기해야 하는지(fork)를 판정한다.

export function buildDriftSystem(): string {
  return `너는 온톨로지 스키마 드리프트 판정기다. 현재 패턴(역할·관계 집합) 밖에서 나타난 신규 요소를 보고 정렬 가능성을 판정한다.
- alignedName/alignedKind: 신규 요소가 기존 역할(role) 또는 관계(relation)에 충실히 정렬되면 그 이름과 종류. 정렬 대상이 없으면 둘 다 null.
- alignScore: 정렬 강도 0~1(이름·의미 유사). 정렬 대상이 없으면 0.
- inDomain: 정렬 대상이 없을 때, 이 요소가 현재 도메인의 자연스러운 확장인지(true) 아니면 다른 도메인이라 분기해야 하는지(false).
- rationale: 판정 근거(어떤 역할/관계와 비교했는지, 왜 확장/분기인지).
- confidence: 판정 신뢰도 0~1.
같은 도메인의 새 개념(예: 진단 도메인의 자연스러운 새 원인)은 inDomain=true(확장). 다른 업무 흐름(예: 진단 맥락에 유입된 행정 승인 절차)은 inDomain=false(분기).`;
}

export function buildDriftUser(
  element: DriftElement,
  ctx: DriftPatternContext,
): string {
  const roleNames = ctx.roles.map((r) => r.name).join(', ') || '(없음)';
  const relationNames =
    ctx.relationTypes.map((r) => r.name).join(', ') || '(없음)';
  const endpoints =
    element.kind === 'relation'
      ? `\n끝점: ${element.sourceRole ?? '?'} → ${element.targetRole ?? '?'}`
      : '';
  return `도메인: ${ctx.domain}
현재 역할: ${roleNames}
현재 관계: ${relationNames}

신규 요소(${element.kind === 'concept' ? '개념=역할 후보' : '관계=관계타입 후보'}): ${element.name}${endpoints}
설명: ${element.description ?? '(없음)'}

이 신규 요소를 위 패턴에 정렬할 수 있는지 판정하라.`;
}
