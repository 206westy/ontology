'use client';

// 레이아웃(fcose 자동배치 / dagre 계층) + Cytoscape 확장 등록. elk-layout.ts 대체.
// 증분 배치: 초기/명시 정리만 전체 fcose, 노드 추가 시엔 기존 노드를 고정하고 신규만 배치 → 기존 위치 안정.
//
// 물리 모델: 상용 그래프 엔진(yFiles/Ogma/NVL)과 동일하게 "상시 물리 없음".
//  - 초기/정리: fcose 1회(또는 군집 시드 fcose 1회) → 좌표 영속.
//  - 드래그: 잡은 노드만 이동(cytoscape 기본) — 이웃을 물리로 밀지 않아 워프가 원천 발생하지 않음.
//  - 신규 노드: 이웃 근처 시드 + 증분 fcose 1회 합류(기존 노드 고정).
// (구 cola 무한 시뮬레이션은 handleDisconnected 재패킹으로 노드가 순간이동하던 워프 버그의 원인 → 제거)

import type { Core, LayoutOptions, NodeSingular, EdgeSingular } from 'cytoscape';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import dagre from 'cytoscape-dagre';
import cola from 'cytoscape-cola';
import edgehandles from 'cytoscape-edgehandles';
import { detectCommunities, computeSeedPositions, type ClusterEdge } from './graph-cluster';

let registered = false;

/** fcose/dagre/cola/edgehandles 확장을 1회 등록(HMR 재등록은 no-op). */
export function registerCytoscapeExtensions(): void {
  if (registered) return;
  try {
    cytoscape.use(fcose);
    cytoscape.use(dagre);
    cytoscape.use(cola);
    cytoscape.use(edgehandles);
  } catch {
    // 이미 등록됨(HMR)
  }
  registered = true;
}

/**
 * cola 지속 물리(라이브 자기조직화 드래그). 로드 시 좌표를 부드럽게 정돈하고, 드래그 시 이웃이 반응.
 * handleDisconnected:false — 비연결 컴포넌트 격자 재배치를 끈다. (이것이 "툭툭 워프"의 원인이었다.)
 * randomize:false — 항상 현재 좌표에서 시작 → 재정렬 시 노드가 순간이동하지 않음.
 * infinite:true — 멈추지 않음(웨이크/슬립은 호출부가 run/stop으로 제어).
 */
export function buildColaOptions(): LayoutOptions {
  return {
    name: 'cola',
    infinite: true,
    fit: false,
    animate: true,
    ungrabifyWhileSimulating: false,
    randomize: false,
    // 관계 타입별 링크 거리 차등 — 계층/소속은 짧게(응집), 일반 관계는 길게(분산).
    edgeLength: (edge: { hasClass: (c: string) => boolean }) =>
      edge.hasClass('isa') ? 70 : edge.hasClass('instanceof') ? 55 : 120,
    nodeSpacing: 16,
    avoidOverlap: true,
    handleDisconnected: false, // ← 워프 원천 차단(격자 재배치 금지)
    convergenceThreshold: 0.01,
    maxSimulationTime: 3000,
  } as unknown as LayoutOptions;
}

export interface FcoseOptionInput {
  animate?: boolean;
  randomize?: boolean;
  fit?: boolean;
  /** 고정할 노드 좌표(증분 배치 시 기존 노드). 비우면 전체 배치. */
  fixed?: { nodeId: string; position: { x: number; y: number } }[];
}

/** fcose 레이아웃 옵션 빌더 (순수, 테스트 대상). */
export function buildFcoseOptions(input: FcoseOptionInput = {}): LayoutOptions {
  const { animate = true, randomize = true, fit = true, fixed } = input;
  return {
    name: 'fcose',
    quality: 'default',
    animate,
    animationDuration: 350,
    randomize,
    nodeSeparation: 75,
    idealEdgeLength: 100,
    nodeRepulsion: 4500,
    padding: 40,
    fit,
    ...(fixed && fixed.length ? { fixedNodeConstraint: fixed } : {}),
  } as unknown as LayoutOptions;
}

/** dagre 계층 레이아웃 옵션 빌더 (순수, 테스트 대상). */
export function buildDagreOptions(fit = true): LayoutOptions {
  return {
    name: 'dagre',
    rankDir: 'TB',
    nodeSep: 40,
    rankSep: 80,
    animate: true,
    animationDuration: 350,
    padding: 40,
    fit,
  } as unknown as LayoutOptions;
}

/** 전체 fcose 자동배치. */
export function runFcose(cy: Core, input: FcoseOptionInput = {}): void {
  if (cy.nodes().length === 0) return;
  cy.layout(buildFcoseOptions(input)).run();
}

/** dagre 계층 배치. */
export function runDagre(cy: Core, fit = true): void {
  if (cy.nodes().length === 0) return;
  cy.layout(buildDagreOptions(fit)).run();
}

/** 신규 노드를 이웃(기존) 노드 평균 좌표 근처로 시드 → 0,0에서 튀어들어오는 현상 완화. */
export function seedNodesNearNeighbors(cy: Core, newNodeIds: string[]): void {
  const newSet = new Set(newNodeIds);
  newSet.forEach((id) => {
    const node = cy.getElementById(id) as NodeSingular;
    if (node.empty()) return;
    const neighborsExisting = node.neighborhood('node').filter((n: NodeSingular) => !newSet.has(n.id()));
    if (neighborsExisting.length > 0) {
      const avg = neighborsExisting.reduce(
        (acc: { x: number; y: number }, n: NodeSingular) => ({ x: acc.x + n.position('x'), y: acc.y + n.position('y') }),
        { x: 0, y: 0 },
      );
      node.position({ x: avg.x / neighborsExisting.length, y: avg.y / neighborsExisting.length + 60 });
    }
  });
}

/**
 * 증분 배치: 신규 노드만 자연스럽게 배치하고 기존 노드는 위치 고정.
 * newNodeIds가 비었거나 기존 노드가 없으면 전체 fcose로 폴백.
 */
export function runIncrementalFcose(cy: Core, newNodeIds: string[]): void {
  if (cy.nodes().length === 0) return;
  const newSet = new Set(newNodeIds);
  const existing = cy.nodes().filter((n: NodeSingular) => !newSet.has(n.id()));
  if (newNodeIds.length === 0 || existing.length === 0) {
    runFcose(cy, { randomize: true });
    return;
  }
  seedNodesNearNeighbors(cy, newNodeIds);
  const fixed = existing.map((n: NodeSingular) => ({ nodeId: n.id(), position: { x: n.position('x'), y: n.position('y') } }));
  cy.layout(buildFcoseOptions({ animate: true, randomize: false, fit: false, fixed })).run();
}

/**
 * 군집 기반 초기 배치: Louvain 커뮤니티 → 군집별 시드 좌표 → fcose 1회 완화(상시 물리 없음).
 * 반환한 community(nodeId→군집 인덱스)로 호출부가 색을 배정한다.
 * 접힌(collapsed)·숨김(hidden) 노드는 물리에서 제외되므로 배치 대상에서 뺀다.
 */
export function runClusteredLayout(cy: Core, opts: { animate?: boolean; extraEdges?: ClusterEdge[] } = {}): Map<string, number> {
  const visible = cy.nodes().filter((n: NodeSingular) => !n.hasClass('collapsed') && !n.hasClass('hidden'));
  if (visible.length === 0) return new Map();

  const nodeIds = visible.map((n: NodeSingular) => n.id());
  const nodeIdSet = new Set(nodeIds);
  const realEdges: ClusterEdge[] = cy
    .edges()
    .filter((e: EdgeSingular) => nodeIdSet.has(e.source().id()) && nodeIdSet.has(e.target().id()))
    .map((e: EdgeSingular) => ({ source: e.source().id(), target: e.target().id() }));
  // 실제 관계 엣지 ∪ 의미 유사 엣지 → 엣지 없이 의미만 가까운 노드도 같은 군집으로.
  const extra = (opts.extraEdges ?? []).filter((e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target));

  const community = detectCommunities(nodeIds, [...realEdges, ...extra]);

  // 인스턴스 → 부모 클래스(classId) 근처 시드용 맵.
  const parentOf = new Map<string, string>();
  visible.forEach((n: NodeSingular) => {
    if (n.data('kind') === 'instance') {
      const pid = n.data('classId');
      if (pid && nodeIdSet.has(pid)) parentOf.set(n.id(), pid);
    }
  });

  const seeds = computeSeedPositions({ nodeIds, community, parentOf });
  cy.batch(() => {
    visible.forEach((n: NodeSingular) => {
      const p = seeds.get(n.id());
      if (p) n.position(p);
    });
  });

  // 시드에서 시작(randomize:false)해 실제 엣지로 연결된 군집을 유기적으로 끌어당긴다.
  cy.layout(buildFcoseOptions({ animate: opts.animate ?? true, randomize: false, fit: true })).run();
  return community;
}
