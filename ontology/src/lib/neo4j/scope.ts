// PRD-N M2: 추론 격리 — Text2Cypher 구획 스코프 유틸(순수, Neo4j 무의존).
// 노드는 `partition` 속성을 갖는다(cypher-builder). 스코프는 서버가 $partition 을
// 바인딩하고 LLM 은 값 하드코딩 없이 그 파라미터만 참조한다(프롬프트 유출·오타 무관).

// 스코프가 켜지면 시스템 프롬프트에 덧붙일 지시 블록. 무스코프면 빈 문자열.
export function buildScopeSystemBlock(partitionId: string | null | undefined): string {
  if (!partitionId) return '';
  return `

PARTITION SCOPE (CRITICAL):
- The graph is scoped to a SINGLE partition. The query MUST only touch nodes in that partition.
- EVERY node you match (:Class / :Instance / :Concept — anchor AND neighbors) MUST be filtered by the bound parameter: \`WHERE n.partition = $partition\`. Use the parameter named $partition; do NOT hardcode its value.
- $partition is supplied by the server. Never omit it while scoped. Example:
    MATCH (anchor) WHERE toLower(anchor.name) CONTAINS toLower($term) AND anchor.partition = $partition
    OPTIONAL MATCH (anchor)-[r]-(neighbor) WHERE neighbor.partition = $partition
    RETURN anchor, r, neighbor LIMIT 50`;
}

export interface CrossPartitionStat {
  // partition 속성을 가진(=개념 노드로 판단되는) 결과 노드 총수.
  totalNodes: number;
  // 그중 현재 구획과 다른 partition 을 가진 노드 수(스코프 준수면 0).
  foreignNodes: number;
}

// Neo4j 결과 행(중첩 properties 또는 평면)에서 partition 속성을 가진 노드를 세어
// 교차 구획 오염(현재 구획 ≠ 노드 partition)을 계량한다. M2 지표(오염률) 소스.
export function countCrossPartition(
  rows: unknown[],
  partitionId: string,
): CrossPartitionStat {
  let totalNodes = 0;
  let foreignNodes = 0;

  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const obj = value as Record<string, unknown>;
    // partition 을 직접 소유한 객체만 노드로 센다(중첩 노드는 properties 백에서,
    // 평면 노드는 자신에서 잡힌다 — 노드당 partition 은 하나라 중복 계수 없음).
    if (typeof obj.partition === 'string') {
      totalNodes++;
      if (obj.partition !== partitionId) foreignNodes++;
    }
    Object.values(obj).forEach(visit);
  };

  rows.forEach(visit);
  return { totalNodes, foreignNodes };
}
