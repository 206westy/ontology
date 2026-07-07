'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import cytoscape, { type Core, type EdgeSingular, type EventObject, type NodeSingular } from 'cytoscape';
import type { EdgeHandlesInstance } from 'cytoscape-edgehandles';
import { useTheme } from 'next-themes';
import { debounce } from 'es-toolkit';
import { match } from 'ts-pattern';

import { useOntologyStore } from './useOntologyStore';
import { updateClassPositionWithoutHistory } from '../store';
import { resolveThemeColors } from '../constants/colors';
import type { OntologyClass, OntologyInstance, OntologyEdge, RelationType } from '../lib/types';
import { buildStylesheet } from '../lib/cytoscape-style';
import { buildElements, syncCytoscape } from '../lib/to-cytoscape-elements';
import { registerCytoscapeExtensions, runFcose, runDagre, runIncrementalFcose, buildColaOptions, seedNodesNearNeighbors } from '../lib/fcose-layout';
import type { Layouts } from 'cytoscape';
import { getNHopNeighborIds } from '../lib/graph-filter';
import type { ContextMenuTarget } from '../components/GraphContextMenu';

const DRAG_HIERARCHY_PROXIMITY = 60;
const ZOOM_DOT_THRESHOLD = 0.45;
// 한 클래스의 인스턴스가 이 수를 넘으면 기본 접힘(개수 배지만). 더블클릭으로 펼침.
// display:none 이므로 접힌 인스턴스는 렌더·물리(cola)에서 함께 제외돼 대량에서도 끊기지 않는다.
const INSTANCE_COLLAPSE_THRESHOLD = 20;

// PRD-Perf M1-2: 드래그 위치 영속(positionX/Y·updatedAt만 변경)인지 판별.
// 위치만 바뀐 경우 cy 가 드래그의 원천이므로 전체 재빌드가 불필요하다.
function isPositionOnlyChange(prev: OntologyClass[], next: OntologyClass[]): boolean {
  if (prev === next || prev.length !== next.length) return false;
  for (let i = 0; i < next.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (a === b) continue;
    if (a.id !== b.id) return false;
    for (const key of Object.keys(b) as (keyof OntologyClass)[]) {
      if (key === 'positionX' || key === 'positionY' || key === 'updatedAt') continue;
      if (a[key] !== b[key]) return false;
    }
  }
  return true;
}

export interface UseCytoscapeResult {
  setContainer: (el: HTMLDivElement | null) => void;
  zoomLevel: number;
  contextMenuTarget: ContextMenuTarget | null;
  setContextMenuTarget: (t: ContextMenuTarget | null) => void;
  relayout: () => void;
  layoutHierarchy: () => void;
  cyRef: React.MutableRefObject<Core | null>;
}

export function useCytoscape(): UseCytoscapeResult {
  const { resolvedTheme } = useTheme();
  const cyRef = useRef<Core | null>(null);
  const ehRef = useRef<EdgeHandlesInstance | null>(null);
  const containerElRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const fittedRef = useRef(false);
  // cola 지속 물리 — 인터랙션 시 깨우고(run) 멈추면 재움(stop)
  const colaRef = useRef<Layouts | null>(null);
  const colaSleepRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // PRD-Perf M1-2: 직전 동기화 입력 — 위치-전용 변경(드래그 영속) 감지용.
  const prevSyncRef = useRef<{
    classes: OntologyClass[];
    instances: OntologyInstance[];
    edges: OntologyEdge[];
    relationTypes: RelationType[];
  } | null>(null);

  const [zoomLevel, setZoomLevel] = useState(100);
  const [contextMenuTarget, setContextMenuTarget] = useState<ContextMenuTarget | null>(null);
  // 인스턴스 접힘 제어: 사용자가 명시적으로 펼친/접은 클래스 id. 나머지는 임계치로 자동 결정.
  const [userExpanded, setUserExpanded] = useState<Set<string>>(() => new Set());
  const [userCollapsed, setUserCollapsed] = useState<Set<string>>(() => new Set());

  // ── store 구독 (렌더러가 읽는 상태) ─────────────────────────────
  const classes = useOntologyStore((s) => s.classes);
  const instances = useOntologyStore((s) => s.instances);
  const edges = useOntologyStore((s) => s.edges);
  const relationTypes = useOntologyStore((s) => s.relationTypes);
  const selectedNodeId = useOntologyStore((s) => s.selectedNodeId);
  const focusNodeId = useOntologyStore((s) => s.focusNodeId);
  const highlightNodeIds = useOntologyStore((s) => s.highlightNodeIds);
  const toolMode = useOntologyStore((s) => s.toolMode);
  const editMode = useOntologyStore((s) => s.editMode);
  const zoomAction = useOntologyStore((s) => s.zoomAction);
  const showClasses = useOntologyStore((s) => s.showClasses);
  const showInstances = useOntologyStore((s) => s.showInstances);
  const colorFilter = useOntologyStore((s) => s.colorFilter);
  const minDegree = useOntologyStore((s) => s.minDegree);
  const currentPartitionId = useOntologyStore((s) => s.currentPartitionId);
  const showAllPartitions = useOntologyStore((s) => s.showAllPartitions);
  const focusModeNodeId = useOntologyStore((s) => s.focusModeNodeId);
  const focusDepth = useOntologyStore((s) => s.focusDepth);

  // cola 깨우기: 시뮬레이션 시작(없으면) — restart=true면 신규 요소 포함 위해 재시작.
  const wakeCola = useCallback((restart = false) => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    if (colaSleepRef.current) {
      clearTimeout(colaSleepRef.current);
      colaSleepRef.current = null;
    }
    if (restart && colaRef.current) {
      colaRef.current.stop();
      colaRef.current = null;
    }
    if (!colaRef.current && cy.nodes().length > 0) {
      colaRef.current = cy.layout(buildColaOptions());
      colaRef.current.run();
    }
  }, []);

  // cola 재우기: idle 일정 시간 후 시뮬레이션 정지 → CPU 0 (노트북 팬 방지).
  const sleepCola = useCallback((delay = 1600) => {
    if (colaSleepRef.current) clearTimeout(colaSleepRef.current);
    colaSleepRef.current = setTimeout(() => {
      colaRef.current?.stop();
      colaRef.current = null;
      colaSleepRef.current = null;
    }, delay);
  }, []);

  const stopCola = useCallback(() => {
    if (colaSleepRef.current) {
      clearTimeout(colaSleepRef.current);
      colaSleepRef.current = null;
    }
    colaRef.current?.stop();
    colaRef.current = null;
  }, []);

  // ── 인스턴스 생성 / 정리 ────────────────────────────────────────
  const initCy = useCallback(() => {
    const container = containerElRef.current;
    if (!container || cyRef.current) return;
    registerCytoscapeExtensions();

    const cy = cytoscape({
      container,
      style: buildStylesheet(resolveThemeColors()),
      minZoom: 0.15,
      maxZoom: 3,
      boxSelectionEnabled: true,
      selectionType: 'single',
    });
    cyRef.current = cy;
    // 개발 모드 한정 — 라이브 cy 인스턴스 노출(디버그/E2E 검증용)
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __cy?: Core }).__cy = cy;

    // 컨테이너 크기 변화 감지 → cy.resize() + 최초 유효 크기에서 1회 fit.
    // (EmptyState→캔버스 전환 시 0×0 측정으로 렌더/이벤트가 죽는 문제 방지)
    const ro = new ResizeObserver(() => {
      if (cy.destroyed()) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      cy.resize();
      if (!fittedRef.current && cy.nodes().length > 0) {
        cy.fit(undefined, 40);
        fittedRef.current = true;
      }
    });
    ro.observe(container);
    resizeObserverRef.current = ro;

    // 브라우저 기본 컨텍스트 메뉴 억제
    container.addEventListener('contextmenu', (e) => e.preventDefault());

    // edgehandles (드래그-연결) — 편집 모드에서만 활성. 생성 직후 비활성.
    const eh: EdgeHandlesInstance = cy.edgehandles({
      canConnect: (s: NodeSingular, t: NodeSingular) => s.id() !== t.id(),
      edgeParams: () => ({ data: { __temp: true } }),
      hoverDelay: 120,
      snap: true,
    });
    ehRef.current = eh;
    eh.disable();

    cy.on('ehcomplete', (_evt: EventObject, source: NodeSingular, target: NodeSingular, addedEdge: EdgeSingular) => {
      addedEdge.remove(); // 자동생성 엣지 제거 → 팝오버로 확정
      useOntologyStore.getState().openPopover({
        type: 'relation',
        position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        sourceId: source.id(),
        targetId: target.id(),
      });
    });

    // ── 기본 이벤트 ──
    cy.on('tap', 'node', (e: EventObject) => {
      const node = e.target as NodeSingular;
      useOntologyStore.getState().selectNode(node.id(), node.data('kind') === 'instance' ? 'instance' : 'class');
    });
    cy.on('tap', (e: EventObject) => {
      if (e.target === cy) useOntologyStore.getState().clearSelection();
    });
    // PRD-B B-3: bridge 엣지 클릭 → 반대편 구획으로 전환
    cy.on('tap', 'edge.bridge', (e: EventObject) => {
      const edge = e.target as EdgeSingular;
      const sp = edge.source().data('partitionId');
      const tp = edge.target().data('partitionId');
      const cur = useOntologyStore.getState().currentPartitionId;
      const other = sp === cur ? tp : sp;
      if (other) useOntologyStore.getState().selectPartition(other);
    });
    cy.on('dbltap', (e: EventObject) => {
      if (e.target !== cy) return;
      const oe = e.originalEvent as MouseEvent;
      useOntologyStore.getState().openPopover({ type: 'newNode', position: { x: oe.clientX, y: oe.clientY } });
    });

    // 클래스 더블클릭 → 해당 클래스의 인스턴스 펼침/접기 토글.
    cy.on('dbltap', 'node', (e: EventObject) => {
      const node = e.target as NodeSingular;
      if (node.data('kind') !== 'class') return;
      const id = node.id();
      const insts = cy.nodes('node[kind = "instance"]').filter((n) => n.data('classId') === id);
      if (insts.empty()) return;
      const anyCollapsed = insts.some((n) => (n as NodeSingular).hasClass('collapsed'));
      if (anyCollapsed) {
        setUserExpanded((prev) => new Set(prev).add(id));
        setUserCollapsed((prev) => {
          const s = new Set(prev);
          s.delete(id);
          return s;
        });
      } else {
        setUserCollapsed((prev) => new Set(prev).add(id));
        setUserExpanded((prev) => {
          const s = new Set(prev);
          s.delete(id);
          return s;
        });
      }
    });

    cy.on('cxttap', 'node', (e: EventObject) => {
      const node = e.target as NodeSingular;
      const kind = node.data('kind') === 'instance' ? 'instance' : 'class';
      const oe = e.originalEvent as MouseEvent;
      useOntologyStore.getState().selectNode(node.id(), kind);
      setContextMenuTarget({ type: kind, nodeId: node.id(), nodeName: node.data('label') ?? '', position: { x: oe.clientX, y: oe.clientY } });
    });
    cy.on('cxttap', 'edge', (e: EventObject) => {
      const edge = e.target as EdgeSingular;
      const oe = e.originalEvent as MouseEvent;
      setContextMenuTarget({ type: 'edge', edgeId: edge.id(), edgeLabel: edge.data('label') ?? '', position: { x: oe.clientX, y: oe.clientY } });
    });
    cy.on('cxttap', (e: EventObject) => {
      if (e.target !== cy) return;
      const oe = e.originalEvent as MouseEvent;
      setContextMenuTarget({ type: 'pane', position: { x: oe.clientX, y: oe.clientY } });
    });

    // 라이브 물리(cola): 노드를 잡으면 시뮬레이션 깨우고(이웃이 밀려남), 드래그 중 유지.
    cy.on('grab', 'node', () => wakeCola());
    cy.on('drag', 'node', () => wakeCola());

    // 드래그 종료: 위치 영속 + (편집 모드) 근접 시 계층 팝오버 + cola 안정화 후 재움
    cy.on('dragfree', 'node', (e: EventObject) => {
      const node = e.target as NodeSingular;
      if (node.data('kind') === 'class') {
        // PRD-Perf M1-2: 위치 영속은 undo 히스토리 스냅샷 없이 기록.
        updateClassPositionWithoutHistory(node.id(), { positionX: node.position('x'), positionY: node.position('y') });
      }
      if (useOntologyStore.getState().editMode === 'edit' && node.data('kind') === 'class') {
        maybeOpenHierarchy(cy, node);
      }
      sleepCola(); // 놓으면 잠깐 더 정렬되다가 멈춤(CPU 절약)
    });

    // 줌 → LOD + 줌% 표시. 줌아웃 시 비허브 라벨만 숨김(허브는 라벨 유지) — PRD §4.1
    const onZoom = debounce(() => {
      if (cy.destroyed()) return;
      const z = cy.zoom();
      setZoomLevel(Math.round(z * 100));
      cy.batch(() => cy.nodes().forEach((n) => n.toggleClass('zdot', z < ZOOM_DOT_THRESHOLD && !n.data('isHub'))));
    }, 60);
    cy.on('zoom', onZoom);

    // ── 호버 Focus + Context (Obsidian 시그니처) ──
    // 호버 노드 + 1홉 이웃만 살리고 나머지는 부드럽게 디밍. 명시적 focus mode가 활성이면 양보.
    const clearHover = () => {
      if (cy.destroyed()) return;
      cy.batch(() => cy.elements().removeClass('dimmed hover-focus hover-edge'));
    };
    cy.on('mouseover', 'node', (e: EventObject) => {
      if (useOntologyStore.getState().focusModeNodeId) return; // 명시 포커스 모드가 디밍 소유
      const node = e.target as NodeSingular;
      if (node.hasClass('hidden')) return;
      const neighborhood = node.closedNeighborhood();
      cy.batch(() => {
        cy.elements().not(neighborhood).addClass('dimmed');
        node.addClass('hover-focus');
        node.connectedEdges().addClass('hover-edge');
      });
    });
    cy.on('mouseout', 'node', () => {
      if (useOntologyStore.getState().focusModeNodeId) return;
      clearHover();
    });

    initializedRef.current = false;
  }, [wakeCola, sleepCola]);

  const setContainer = useCallback(
    (el: HTMLDivElement | null) => {
      containerElRef.current = el;
      if (el) initCy();
    },
    [initCy],
  );

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
      if (colaSleepRef.current) clearTimeout(colaSleepRef.current);
      colaRef.current?.stop();
      colaRef.current = null;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      ehRef.current?.destroy?.();
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, []);

  // ── 데이터 동기화 + 레이아웃 ────────────────────────────────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // PRD-Perf M1-2: 드래그 위치 영속만 바뀐 경우 — cy 가 이미 그 좌표의 원천이므로
    // 전체 재빌드(buildElements+sync+resize+cola)를 생략하고 좌표 정합만 확인한다.
    const prevSync = prevSyncRef.current;
    prevSyncRef.current = { classes, instances, edges, relationTypes };
    if (
      prevSync &&
      initializedRef.current &&
      prevSync.instances === instances &&
      prevSync.edges === edges &&
      prevSync.relationTypes === relationTypes &&
      isPositionOnlyChange(prevSync.classes, classes)
    ) {
      classes.forEach((c, i) => {
        if (c === prevSync.classes[i]) return;
        const n = cy.getElementById(c.id);
        if (n.nonempty() && (n.position('x') !== c.positionX || n.position('y') !== c.positionY)) {
          n.position({ x: c.positionX, y: c.positionY });
        }
      });
      return;
    }

    const elements = buildElements({ classes, instances, edges, relationTypes });
    // 클래스 저장 위치를 신규 노드에 부여(기존 노드는 syncCytoscape가 위치 보존)
    elements.forEach((el) => {
      if (el.data.kind === 'class') {
        const cls = classes.find((c) => c.id === el.data.id);
        if (cls) el.position = { x: cls.positionX, y: cls.positionY };
      }
    });
    const added = syncCytoscape(cy, elements);
    // 컨테이너가 늦게 크기를 얻는 경우 대비 — 데이터 반영 시 강제 resize
    cy.resize();

    if (!initializedRef.current) {
      initializedRef.current = true;
      const noSavedPositions = classes.every((c) => !c.positionX && !c.positionY);
      if (noSavedPositions) {
        runFcose(cy, { randomize: true });
      } else {
        const originIds = cy.nodes().filter((n) => n.position('x') === 0 && n.position('y') === 0).map((n) => n.id());
        runIncrementalFcose(cy, originIds);
      }
      // 레이아웃 후 다음 프레임에 resize + fit (초기 0-size 보정)
      requestAnimationFrame(() => {
        if (cy.destroyed()) return;
        cy.resize();
        if (cy.nodes().length > 0) {
          cy.fit(undefined, 40);
          fittedRef.current = true;
        }
      });
    } else if (added.length > 0) {
      // 신규 노드는 이웃 근처에 시드 후 cola 물리로 자연스럽게 합류 → 안정되면 재움
      seedNodesNearNeighbors(cy, added);
      wakeCola(true);
      sleepCola(2800);
    }
  }, [classes, instances, edges, relationTypes, wakeCola, sleepCola]);

  // 인스턴스 접힘 동기화: 클래스별 인스턴스 수가 임계치를 넘으면(또는 사용자가 접으면) 접고,
  // 사용자가 펼친 클래스는 펼친다. 접힌 인스턴스는 display:none → 렌더·cola에서 제외.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const countByClass = new Map<string, number>();
    instances.forEach((i) => countByClass.set(i.classId, (countByClass.get(i.classId) ?? 0) + 1));
    const isClassCollapsed = (classId: string): boolean => {
      if (userCollapsed.has(classId)) return true;
      if (userExpanded.has(classId)) return false;
      return (countByClass.get(classId) ?? 0) > INSTANCE_COLLAPSE_THRESHOLD;
    };
    cy.batch(() => {
      // 인스턴스: 부모 클래스가 접힘이면 숨김(display:none → 렌더·물리 제외)
      instances.forEach((inst) => {
        const node = cy.getElementById(inst.id);
        if (node.nonempty()) node.toggleClass('collapsed', isClassCollapsed(inst.classId));
      });
      // 클래스 표시 라벨: 접혔고 인스턴스가 있을 때만 `이름 (N)`, 그 외엔 이름만.
      classes.forEach((cls) => {
        const node = cy.getElementById(cls.id);
        if (node.empty()) return;
        const count = countByClass.get(cls.id) ?? 0;
        const showCount = count > 0 && isClassCollapsed(cls.id);
        node.data('displayLabel', showCount ? `${cls.name} (${count})` : cls.name);
      });
    });
  }, [classes, instances, userExpanded, userCollapsed]);

  // 선택 동기화 + 연결 엣지 강조
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.edges().removeClass('connected');
      cy.elements(':selected').unselect();
      if (selectedNodeId) {
        const node = cy.getElementById(selectedNodeId);
        if (node.nonempty()) {
          node.select();
          node.connectedEdges().addClass('connected');
        }
      }
    });
  }, [selectedNodeId]);

  // 단일 포커스: center + 1.5s pulse
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !focusNodeId) return;
    const node = cy.getElementById(focusNodeId);
    if (node.nonempty()) {
      cy.animate({ fit: { eles: node, padding: 140 }, duration: 300 });
      pulse(cy, node);
    }
    useOntologyStore.getState().clearFocus();
  }, [focusNodeId]);

  // 다중 하이라이트(Text2Cypher/AI): fit + pulse
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || highlightNodeIds.length === 0) return;
    const eles = cy.collection();
    highlightNodeIds.forEach((id) => {
      const n = cy.getElementById(id);
      if (n.nonempty()) eles.merge(n);
    });
    if (eles.nonempty()) {
      cy.animate({ fit: { eles, padding: 90 }, duration: 300 });
      pulse(cy, eles);
    }
    useOntologyStore.getState().clearHighlight();
  }, [highlightNodeIds]);

  // 줌 액션(툴바)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !zoomAction) return;
    match(zoomAction)
      .with('in', () => cy.zoom({ level: cy.zoom() * 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }))
      .with('out', () => cy.zoom({ level: cy.zoom() / 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }))
      .with('fit', () => cy.fit(undefined, 40))
      .exhaustive();
    useOntologyStore.getState().clearZoomAction();
  }, [zoomAction]);

  // toolMode: pan / select
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.userPanningEnabled(true);
    cy.boxSelectionEnabled(toolMode === 'select');
  }, [toolMode]);

  // editMode: edgehandles + 드래그-onto 계층(드래그-onto는 dragfree 핸들러 내 editMode 체크로 처리)
  useEffect(() => {
    const eh = ehRef.current;
    if (!eh) return;
    if (editMode === 'edit') eh.enable();
    else eh.disable();
  }, [editMode]);

  // 필터 + 구획 스코프: 숨김 토글(요소 제거 아님 → 위치 보존)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const isClass = n.data('kind') === 'class';
        let hidden = isClass ? !showClasses : !showInstances;
        if (!hidden && colorFilter.length > 0) {
          const ck = n.data('colorKey');
          if (ck && !colorFilter.includes(ck)) hidden = true;
        }
        // 차수 필터: 차수 N 미만 노드 숨김(잡음 노드 제거) — PRD §4.4
        if (!hidden && minDegree > 0) {
          if ((n.data('degree') ?? 0) < minDegree) hidden = true;
        }
        // PRD-B B-3: 구획 스코프 — 전체 보기가 아니면 현재 구획만 표시
        if (!hidden && !showAllPartitions && currentPartitionId) {
          const pid = n.data('partitionId');
          if (pid && pid !== currentPartitionId) hidden = true;
        }
        n.toggleClass('hidden', hidden);
      });
    });
  }, [showClasses, showInstances, colorFilter, minDegree, currentPartitionId, showAllPartitions]);

  // focus mode: N-hop 이웃 외 디밍
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (!focusModeNodeId) {
      cy.batch(() => cy.elements().removeClass('dimmed'));
      return;
    }
    const edgeList = cy.edges().map((e) => ({ source: e.source().id(), target: e.target().id() }));
    const neighbors = getNHopNeighborIds(focusModeNodeId, focusDepth, edgeList);
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        n.toggleClass('dimmed', !neighbors.has(n.id()));
      });
      cy.edges().forEach((e) => {
        e.toggleClass('dimmed', !(neighbors.has(e.source().id()) && neighbors.has(e.target().id())));
      });
    });
  }, [focusModeNodeId, focusDepth]);

  // 테마 변경 → 스타일시트 재적용 (요소 데이터 불변)
  useEffect(() => {
    cyRef.current?.style(buildStylesheet(resolveThemeColors()));
  }, [resolvedTheme]);

  // "레이아웃 정리" — cola 정지 후 fcose 일회성 정렬(structured tidy).
  const relayout = useCallback(() => {
    if (!cyRef.current) return;
    stopCola();
    runFcose(cyRef.current, { randomize: true });
  }, [stopCola]);
  const layoutHierarchy = useCallback(() => {
    if (!cyRef.current) return;
    stopCola();
    runDagre(cyRef.current);
  }, [stopCola]);

  function pulse(cy: Core, eles: cytoscape.Collection) {
    eles.addClass('pulse');
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => {
      cy.batch(() => eles.removeClass('pulse'));
      pulseTimerRef.current = null;
    }, 1500);
  }

  return { setContainer, zoomLevel, contextMenuTarget, setContextMenuTarget, relayout, layoutHierarchy, cyRef };
}

// 드래그-onto 계층: 다른 class 노드와 60px 근접 시 계층 팝오버 (편집 모드 전용)
function maybeOpenHierarchy(cy: Core, dragged: NodeSingular): void {
  const store = useOntologyStore.getState();
  const sourceClass = store.classes.find((c) => c.id === dragged.id());
  const dpos = dragged.position();
  for (const target of cy.nodes()) {
    if (target.id() === dragged.id() || target.data('kind') !== 'class') continue;
    if (sourceClass?.parentId === target.id()) continue;
    const exists = store.edges.some(
      (e) =>
        (e.sourceId === dragged.id() && e.targetId === target.id()) ||
        (e.sourceId === target.id() && e.targetId === dragged.id()),
    );
    if (exists) continue;
    const tpos = target.position();
    if (Math.abs(dpos.x - tpos.x) < DRAG_HIERARCHY_PROXIMITY && Math.abs(dpos.y - tpos.y) < DRAG_HIERARCHY_PROXIMITY) {
      store.openPopover({ type: 'hierarchy', position: { x: window.innerWidth / 2, y: window.innerHeight / 3 }, sourceId: dragged.id(), targetId: target.id() });
      break;
    }
  }
}
