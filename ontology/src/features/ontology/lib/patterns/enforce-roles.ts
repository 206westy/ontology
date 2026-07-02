// PRD-H H3 (M2): no-untyped / no-parentless 가드.
// 패턴이 확정된 추출에서는 모든 노드가 패턴 역할(role) 중 하나로 타이핑돼야 한다.
// 이 순수 함수는 entity.type 을 가장 가까운 역할로 정규화한다. 매핑되지 않는 노드는
// 조용히 untyped/parentless 로 만들지 않고 경고 목록으로 드러낸다(검토 UI 노출용).
//
// name/type 만 읽으므로 파이프라인의 ParsedEntity(엄격 스키마)와 api 의 느슨한
// 엔티티 타입 모두에 쓸 수 있도록 제네릭으로 둔다.
type RoleTypedEntity = { name: string; type: string };

export interface RoleEnforcementResult<T extends RoleTypedEntity> {
  entities: T[];
  warnings: string[];
  // 역할에 매핑되지 못한 엔티티 이름(경고와 1:1). 후속 라우팅용.
  unmatched: string[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

// entity.type 을 가장 가까운 역할로 해석한다: 정규화 완전일치 → 부분 포함(양방향).
function matchRole(type: string, roleNames: string[]): string | null {
  const target = normalize(type);
  if (!target) return null;
  const exact = roleNames.find((r) => normalize(r) === target);
  if (exact) return exact;
  const contains = roleNames.find((r) => {
    const n = normalize(r);
    return n.includes(target) || target.includes(n);
  });
  return contains ?? null;
}

export function enforcePatternRoles<T extends RoleTypedEntity>(
  entities: T[],
  roleNames: string[],
): RoleEnforcementResult<T> {
  const warnings: string[] = [];
  const unmatched: string[] = [];

  const mapped = entities.map((entity) => {
    const role = matchRole(entity.type, roleNames);
    if (role) {
      // 매핑된 역할의 정식 이름으로 정규화(대소문자·공백 흔들림 제거).
      return role === entity.type ? entity : { ...entity, type: role };
    }
    // 매핑 실패: 원본 type 을 유지(untyped 로 만들지 않음)하고 경고를 남긴다.
    unmatched.push(entity.name);
    warnings.push(
      `역할에 매핑되지 않은 노드: "${entity.name}" (type: "${entity.type || '없음'}"). 패턴 역할 중 하나로 분류해 주세요.`,
    );
    return entity;
  });

  return { entities: mapped, warnings, unmatched };
}
