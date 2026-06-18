// 엔진 비종속 그래프 필터/이웃 유틸 — Cytoscape/React Flow 어느 쪽에도 의존하지 않는다.

export interface EdgeLike {
  source: string;
  target: string;
}

/**
 * 노드의 N-hop 이웃 집합(원점 포함)을 반환.
 */
export function getNHopNeighborIds(originId: string, depth: number, edges: EdgeLike[]): Set<string> {
  const neighborIds = new Set<string>([originId]);
  let frontier = new Set<string>([originId]);

  for (let hop = 0; hop < depth; hop++) {
    const nextFrontier = new Set<string>();
    for (const edge of edges) {
      if (frontier.has(edge.source) && !neighborIds.has(edge.target)) {
        nextFrontier.add(edge.target);
        neighborIds.add(edge.target);
      }
      if (frontier.has(edge.target) && !neighborIds.has(edge.source)) {
        nextFrontier.add(edge.source);
        neighborIds.add(edge.source);
      }
    }
    frontier = nextFrontier;
    if (frontier.size === 0) break;
  }

  return neighborIds;
}

/**
 * 필터가 기본 상태(전부 표시)에서 벗어났는지 여부.
 */
export function hasActiveFilter(options: {
  showClasses: boolean;
  showInstances: boolean;
  colorFilter: string[];
  minDegree?: number;
}): boolean {
  return (
    !options.showClasses ||
    !options.showInstances ||
    options.colorFilter.length > 0 ||
    (options.minDegree ?? 0) > 0
  );
}
