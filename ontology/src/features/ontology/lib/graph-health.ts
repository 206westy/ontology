import type { OntologyEdge } from './types';

// 클라이언트에서 계산하는 그래프 "구조 점검".
// 서버 건강 지표(고아·빈 클래스·중복 후보·검증 위반)와 별개로, 항상 명백한
// 구조적 결함만 보수적으로 탐지한다(오탐 최소화). loadOntology(import) 는 addEdge
// 의 자기루프·중복 가드를 거치지 않으므로 가져온 데이터에서 실제로 발생할 수 있다.

export type StructureIssueKind = 'self_loop' | 'duplicate_edge';

export interface StructureIssue {
  kind: StructureIssueKind;
  edgeId: string;
  sourceId: string;
  sourceKind: 'class' | 'instance';
  /** 사람이 읽는 요약 (예: `"A —[hasPart]→ A (자기 자신을 가리킴)"`) */
  label: string;
}

/**
 * 자기 루프(source === target)와 중복 엣지(동일 relationType·source·target 의 2번째 이후)를
 * 찾는다. 순수 함수 — 입력을 변형하지 않는다.
 */
export function findStructureIssues(
  edges: OntologyEdge[],
  nameOfNode: (id: string) => string,
  nameOfRelation: (relationTypeId: string) => string,
): StructureIssue[] {
  const issues: StructureIssue[] = [];
  const seen = new Set<string>();

  for (const e of edges) {
    const rel = nameOfRelation(e.relationTypeId);

    if (e.sourceId === e.targetId) {
      issues.push({
        kind: 'self_loop',
        edgeId: e.id,
        sourceId: e.sourceId,
        sourceKind: e.sourceKind,
        label: `${nameOfNode(e.sourceId)} —[${rel}]→ 자기 자신`,
      });
      continue;
    }

    const key = `${e.relationTypeId}::${e.sourceId}::${e.targetId}`;
    if (seen.has(key)) {
      issues.push({
        kind: 'duplicate_edge',
        edgeId: e.id,
        sourceId: e.sourceId,
        sourceKind: e.sourceKind,
        label: `${nameOfNode(e.sourceId)} —[${rel}]→ ${nameOfNode(e.targetId)} (중복)`,
      });
    } else {
      seen.add(key);
    }
  }

  return issues;
}
