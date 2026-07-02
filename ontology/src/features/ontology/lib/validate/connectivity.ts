// PRD-H (H7/M5): 연결성(도달성) 검증 — 순수 함수.
// 현행 "섬 없음" 오탐 교정: 그래프가 실제로 몇 개의 분리된 조각으로 나뉘는지
// 도달성(무향)으로 세고, 2개 이상이면 "N개로 분리" 경고를 명시적으로 만든다.
// 고아 탐지는 클래스뿐 아니라 인스턴스까지 확장한다(노드를 종류 구분 없이 취급).
// 아무 것도 강제로 잇지 않는다 — 섬은 정직하게 섬으로 보고한다(IslandList 원칙).

export interface ConnectivityNode {
  id: string;
}

export interface ConnectivityEdge {
  sourceId: string;
  targetId: string;
}

export interface ConnectivityReport {
  nodeCount: number;
  edgeCount: number;
  // 분리된 연결 컴포넌트 수. 고립 노드는 각자 1개 컴포넌트.
  componentCount: number;
  // 단일 연결(컴포넌트 ≤ 1)인가. 빈 그래프는 vacuously 단일 연결로 본다.
  isConnected: boolean;
  // 관계가 하나도 없는 고아 노드 id(클래스·인스턴스 모두 포함).
  isolatedIds: string[];
  // 컴포넌트가 2개 이상일 때만 한국어 경고. 아니면 null.
  warning: string | null;
}

// Union-Find(경로 압축) — 노드 id 를 무향으로 합친다.
function makeUnionFind(ids: string[]): {
  find: (x: string) => string;
  union: (a: string, b: string) => void;
} {
  const parent = new Map<string, string>();
  for (const id of ids) parent.set(id, id);

  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // 경로 압축.
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };

  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  return { find, union };
}

// 도달성으로 분리 컴포넌트 수·고아를 센다. 엣지 끝점이 노드 목록에 없어도
// 하나의 노드로 취급해 컴포넌트에 포함한다(관계로 참조되면 고아가 아님).
export function analyzeConnectivity(
  nodes: ConnectivityNode[],
  edges: ConnectivityEdge[],
): ConnectivityReport {
  const idSet = new Set<string>(nodes.map((n) => n.id));
  for (const e of edges) {
    idSet.add(e.sourceId);
    idSet.add(e.targetId);
  }
  const ids = [...idSet];

  const { find, union } = makeUnionFind(ids);
  const degree = new Map<string, number>();
  for (const id of ids) degree.set(id, 0);
  for (const e of edges) {
    union(e.sourceId, e.targetId);
    degree.set(e.sourceId, (degree.get(e.sourceId) ?? 0) + 1);
    degree.set(e.targetId, (degree.get(e.targetId) ?? 0) + 1);
  }

  const roots = new Set<string>();
  for (const id of ids) roots.add(find(id));
  const componentCount = roots.size;

  const isolatedIds = ids.filter((id) => (degree.get(id) ?? 0) === 0);

  const warning =
    componentCount > 1
      ? `그래프가 ${componentCount}개로 분리되어 있습니다. 근거 있는 관계로 병합하거나 섬으로 둘 수 있습니다.`
      : null;

  return {
    nodeCount: ids.length,
    edgeCount: edges.length,
    componentCount,
    isConnected: componentCount <= 1,
    isolatedIds,
    warning,
  };
}
