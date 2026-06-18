'use client';

// 레이아웃(fcose 자동배치 / dagre 계층) + Cytoscape 확장 등록. elk-layout.ts 대체.
// 증분 배치: 초기/명시 정리만 전체 fcose, 노드 추가 시엔 기존 노드를 고정하고 신규만 배치 → 기존 위치 안정.

import type { Core, LayoutOptions, NodeSingular } from 'cytoscape';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import dagre from 'cytoscape-dagre';
import cola from 'cytoscape-cola';
import edgehandles from 'cytoscape-edgehandles';

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
 * cola 지속 물리 시뮬레이션 옵션 (Obsidian식 라이브 드래그).
 * infinite:true → 멈추지 않음(웨이크/슬립은 호출부가 run/stop으로 제어).
 * ungrabifyWhileSimulating:false → 시뮬레이션 중에도 노드를 잡아 끌 수 있고, 끌면 이웃이 밀려남.
 */
export function buildColaOptions(): LayoutOptions {
  return {
    name: 'cola',
    infinite: true,
    fit: false,
    animate: true,
    ungrabifyWhileSimulating: false,
    randomize: false,
    // 관계 타입별 링크 거리 차등 — 계층/소속은 짧게(응집), 일반 관계는 길게(분산) → 유기적 군집.
    edgeLength: (edge: { hasClass: (c: string) => boolean }) =>
      edge.hasClass('isa') ? 70 : edge.hasClass('instanceof') ? 55 : 120,
    nodeSpacing: 16, // forceCollide 대응 — 커진 허브 노드 겹침 방지(라벨 충돌 완화)
    avoidOverlap: true,
    handleDisconnected: true,
    maxSimulationTime: 4000,
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
