import type {
  OntologyClass,
  OntologyInstance,
  OntologyProperty,
  RelationType,
  OntologyEdge,
  OntologyAxiom,
  InstanceValue,
  CommitDetail,
  ChangeOperation,
} from './types';

// PRD-J M2: 브랜치 체크아웃 재생 엔진.
// 베이스 스냅샷(분기 시점 main 전체) 위에 브랜치 커밋 details 를 오래된 순으로
// 재생해 브랜치의 현재 상태를 재구성한다. 순수 함수 — 입력을 변형하지 않는다.
//
// 재생 규칙: ADD → afterSnapshot 추가(동일 id 있으면 교체 — 재체크아웃 멱등),
// MOD → id 로 교체(없으면 추가 — 손상 이력 방어), DEL → id 로 제거.
// 캐스케이드 삭제는 entity-slice 가 개별 DEL 로 이미 기록하므로 단순 재생으로 충분.

export const BRANCH_SNAPSHOT_SCHEMA_VERSION = 1;

export interface BranchSnapshot {
  schemaVersion?: number;
  classes: OntologyClass[];
  properties: OntologyProperty[];
  instances: OntologyInstance[];
  instanceValues: InstanceValue[];
  relationTypes: RelationType[];
  edges: OntologyEdge[];
  axioms: OntologyAxiom[];
}

export interface BranchWorkingState {
  classes: OntologyClass[];
  properties: OntologyProperty[];
  instances: OntologyInstance[];
  instanceValues: InstanceValue[];
  relationTypes: RelationType[];
  edges: OntologyEdge[];
  axioms: OntologyAxiom[];
}

export type ReplayDetail = Pick<
  CommitDetail,
  'operation' | 'targetTable' | 'targetId' | 'afterSnapshot'
>;

type EntityKey = keyof BranchWorkingState;

const TABLE_TO_KEY: Record<string, EntityKey> = {
  classes: 'classes',
  properties: 'properties',
  instances: 'instances',
  instance_values: 'instanceValues',
  relation_types: 'relationTypes',
  edges: 'edges',
  axioms: 'axioms',
};

function applyOne<T extends { id: string }>(
  list: T[],
  operation: ChangeOperation,
  targetId: string,
  afterSnapshot: Record<string, unknown> | null | undefined,
): T[] {
  if (operation === 'DEL') {
    return list.filter((item) => item.id !== targetId);
  }
  // ADD/MOD: afterSnapshot 이 없으면 반영할 데이터가 없다 — 스킵(손상 이력 방어).
  if (!afterSnapshot) return list;
  const entity = { ...(afterSnapshot as unknown as T), id: targetId };
  const exists = list.some((item) => item.id === targetId);
  return exists
    ? list.map((item) => (item.id === targetId ? entity : item))
    : [...list, entity];
}

export function isSnapshotVersionSupported(snapshot: BranchSnapshot): boolean {
  return (snapshot.schemaVersion ?? 1) <= BRANCH_SNAPSHOT_SCHEMA_VERSION;
}

// 스냅샷 + 커밋 details(오래된 순) → 브랜치 작업 상태.
export function materializeBranchState(
  snapshot: BranchSnapshot,
  detailsInOrder: ReplayDetail[],
): BranchWorkingState {
  let state: BranchWorkingState = {
    classes: snapshot.classes ?? [],
    properties: snapshot.properties ?? [],
    instances: snapshot.instances ?? [],
    instanceValues: snapshot.instanceValues ?? [],
    relationTypes: snapshot.relationTypes ?? [],
    edges: snapshot.edges ?? [],
    axioms: snapshot.axioms ?? [],
  };

  for (const detail of detailsInOrder) {
    const key = TABLE_TO_KEY[detail.targetTable];
    if (!key) continue; // constraints 등 스토어 밖 테이블은 재생 대상 아님
    state = {
      ...state,
      [key]: applyOne(
        state[key] as { id: string }[],
        detail.operation,
        detail.targetId,
        detail.afterSnapshot,
      ),
    };
  }

  return state;
}
