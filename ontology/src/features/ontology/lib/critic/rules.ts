// S3 — Critic 규칙 레지스트리 (컨벤션 명문화).
//
// 검수 결과(CriticIssue)의 ruleId가 여기 정의된 규칙을 가리킨다. 규칙은
// 라벨·설명·기본 심각도·on/off·도메인 태그를 메타데이터로 가진다. 이렇게 하면
//   - UI에서 규칙별 설명을 보여주고
//   - 도메인(반도체 등)에서 규칙을 추가·강등/승격·비활성화할 수 있다.
// 검수 함수 자체는 review.ts에 고정되어 있고, 여기서는 그 출력을 규율한다.

import type { CriticIssue, CriticIssueKind, CriticSeverity } from './review';

export interface CriticRule {
  id: string;
  kind: CriticIssueKind;
  // 짧은 한국어 라벨.
  label: string;
  // 무엇을 검사하는지.
  description: string;
  defaultSeverity: CriticSeverity;
  enabledByDefault: boolean;
  // 도메인 한정 규칙이면 도메인 키(예: 'semiconductor'). 일반 규칙은 undefined.
  domain?: string;
}

// 일반(도메인 중립) 규칙 — review.ts의 ruleId와 1:1.
export const GENERAL_RULES: CriticRule[] = [
  {
    id: 'duplicate-existing-exact',
    kind: 'duplicate_existing',
    label: '기존 노드와 동일',
    description: '새 노드가 기존 모델 노드와 이름이 동일합니다. 재사용해야 합니다.',
    defaultSeverity: 'high',
    enabledByDefault: true,
  },
  {
    id: 'duplicate-existing-near',
    kind: 'duplicate_existing',
    label: '기존 노드와 유사(오타)',
    description: '새 노드가 기존 노드와 매우 유사합니다(오타 가능).',
    defaultSeverity: 'med',
    enabledByDefault: true,
  },
  {
    id: 'duplicate-within',
    kind: 'duplicate_within',
    label: '추출분 내 중복',
    description: '새 추출분 안에서 두 노드가 서로 중복으로 보입니다.',
    defaultSeverity: 'med',
    enabledByDefault: true,
  },
  {
    id: 'star-hub',
    kind: 'star_hub',
    label: '별모양 허브',
    description: '한 노드가 관계를 과도하게 흡수합니다(문서 제목 허브 강제).',
    defaultSeverity: 'med',
    enabledByDefault: true,
  },
  {
    id: 'orphan',
    kind: 'orphan',
    label: '고립 노드',
    description: '연결된 관계가 없는 고립 노드입니다(정직한 섬은 허용).',
    defaultSeverity: 'low',
    enabledByDefault: true,
  },
  {
    id: 'undefined-concept',
    kind: 'undefined_concept',
    label: '미정의 개념',
    description: '관계 대상으로 참조되지만 정의가 없습니다.',
    defaultSeverity: 'high',
    enabledByDefault: true,
  },
  {
    id: 'class-instance-confusion',
    kind: 'class_instance_confusion',
    label: '클래스/인스턴스 혼동',
    description: '같은 이름이 종류만 다르게 충돌합니다.',
    defaultSeverity: 'med',
    enabledByDefault: true,
  },
  {
    id: 'llm-contradictory_relation',
    kind: 'contradictory_relation',
    label: '모순 관계',
    description: '서로 모순되거나 방향이 뒤집힌 관계입니다(LLM 정성).',
    defaultSeverity: 'high',
    enabledByDefault: true,
  },
  {
    id: 'llm-weak_modeling',
    kind: 'weak_modeling',
    label: '정량 근거 부족',
    description: '정성 서술만 있고 정량 제약(임계·방향·단위)이 빠졌습니다(LLM 정성).',
    defaultSeverity: 'med',
    enabledByDefault: true,
  },
];

// 도메인 한정 규칙 확장 슬롯. 도메인별로 규칙을 등록해 둔다. 검수 함수는 고정이라
// 여기서는 라벨/심각도/활성 여부만 도메인에 맞춰 덮어쓰는 용도. (예: 반도체에서는
// 고립 노드를 더 엄격히 본다 등.)
export const DOMAIN_RULES: Record<string, CriticRule[]> = {};

// 도메인 규칙 등록(또는 일반 규칙의 도메인 오버라이드).
export function registerDomainRules(domain: string, rules: CriticRule[]): void {
  DOMAIN_RULES[domain] = [...(DOMAIN_RULES[domain] ?? []), ...rules];
}

// 활성 규칙 집합 — 일반 규칙 + (선택) 도메인 규칙. 같은 id는 도메인이 덮어쓴다.
export function resolveRules(domain?: string): CriticRule[] {
  const byId = new Map<string, CriticRule>();
  for (const r of GENERAL_RULES) byId.set(r.id, r);
  if (domain) for (const r of DOMAIN_RULES[domain] ?? []) byId.set(r.id, r);
  return [...byId.values()];
}

export function getRule(id: string, domain?: string): CriticRule | undefined {
  return resolveRules(domain).find((r) => r.id === id);
}

// 비활성 규칙(enabledByDefault=false 이거나 disabledIds에 포함)의 이슈를 제거.
export function filterIssuesByRules(
  issues: CriticIssue[],
  opts: { domain?: string; disabledIds?: string[] } = {},
): CriticIssue[] {
  const rules = resolveRules(opts.domain);
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const disabled = new Set(opts.disabledIds ?? []);
  return issues.filter((issue) => {
    if (disabled.has(issue.ruleId)) return false;
    const rule = ruleById.get(issue.ruleId);
    // 레지스트리에 없는 규칙은 통과(미래 LLM 규칙 호환). 있으면 enabled 여부 존중.
    return rule ? rule.enabledByDefault : true;
  });
}
