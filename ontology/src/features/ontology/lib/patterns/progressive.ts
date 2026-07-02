// PRD-H H3 (M2): 점진적 렌더(애니메이션 삽입)의 순수 코어.
// 전체 파싱 결과를 받아 노드/엣지를 "삽입 배치"로 정렬한다. 애니메이션 계층은
// 이 배치를 setTimeout 등으로 순차 소비하는 얇은 consumer 일 뿐이다(여기엔 타이머 없음).
//
// 정렬 규칙:
//  - 클래스(루트/상위)가 인스턴스보다 먼저(부모 클래스 → 자식 클래스 → 인스턴스).
//  - 엣지는 양 끝점 노드가 모두 삽입된 뒤에만 배치 → 절대 dangling 되지 않는다.

export interface InsertNode {
  id: string;
  kind: 'class' | 'instance';
  // 클래스의 부모 클래스 id(루트면 null). 인스턴스는 소유 클래스 id.
  parentId?: string | null;
}

export interface InsertEdge {
  id: string;
  sourceId: string;
  targetId: string;
}

export type InsertionBatch =
  | { kind: 'nodes'; nodes: InsertNode[] }
  | { kind: 'edges'; edges: InsertEdge[] };

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return items.length ? [items] : [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// 클래스를 부모 깊이 오름차순으로 정렬한다(루트 먼저). 부모가 노드 집합 밖이면 깊이 0.
function orderClassesByDepth(classes: InsertNode[]): InsertNode[] {
  const byId = new Map(classes.map((c) => [c.id, c]));
  const depthCache = new Map<string, number>();

  const depthOf = (node: InsertNode, seen: Set<string>): number => {
    if (depthCache.has(node.id)) return depthCache.get(node.id)!;
    if (!node.parentId || !byId.has(node.parentId) || seen.has(node.id)) {
      depthCache.set(node.id, 0);
      return 0;
    }
    seen.add(node.id);
    const d = depthOf(byId.get(node.parentId)!, seen) + 1;
    depthCache.set(node.id, d);
    return d;
  };

  return [...classes]
    .map((c, index) => ({ c, index, depth: depthOf(c, new Set()) }))
    .sort((a, b) => (a.depth !== b.depth ? a.depth - b.depth : a.index - b.index))
    .map((x) => x.c);
}

export function scheduleInsertion(
  nodes: InsertNode[],
  edges: InsertEdge[],
  batchSize: number,
): InsertionBatch[] {
  const classes = nodes.filter((n) => n.kind === 'class');
  const instances = nodes.filter((n) => n.kind === 'instance');

  // 노드 순서: 클래스(부모→자식) → 인스턴스.
  const orderedNodes = [...orderClassesByDepth(classes), ...instances];

  const batches: InsertionBatch[] = chunk(orderedNodes, batchSize).map((nodeBatch) => ({
    kind: 'nodes' as const,
    nodes: nodeBatch,
  }));

  // 엣지는 양 끝점이 모두 스케줄된 것만(그 외는 제외 → dangling 방지).
  const nodeIds = new Set(orderedNodes.map((n) => n.id));
  const safeEdges = edges.filter((e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));

  for (const edgeBatch of chunk(safeEdges, batchSize)) {
    batches.push({ kind: 'edges', edges: edgeBatch });
  }

  return batches;
}
