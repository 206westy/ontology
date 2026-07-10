'use client';

// store(classes/instances/edges/relationTypes) → Cytoscape elements 변환 + diff 동기화.
// 전체 재생성 금지: 신규 add / 누락 remove / 변경(label·size·colorKey) in-place update → 위치·선택 보존.
// PRD-B 훅: partition_id가 있으면 element data에 partitionId로 그대로 통과(구획 로직은 B).

import type { Core, ElementDefinition } from 'cytoscape';
import { NODE_COLORS } from '../constants/colors';
import type { OntologyClass, OntologyInstance, OntologyEdge } from './types';

export type NodeColorKey = keyof typeof NODE_COLORS;

// 팔레트 재스킨 이전(채도 높은 구 팔레트)에 저장된 class.color(hex) → colorKey 역매핑.
// 새 NODE_COLORS hex와 매칭 실패 시 구 데이터가 전부 'root'로 붕괴하는 것을 방지한다.
// light/dark 양쪽 구 값을 모두 포함.
const LEGACY_COLOR_KEY: Record<string, NodeColorKey> = {
  // 구 light (초기 채도 높은 팔레트)
  '#7c3aed': 'root', '#2563eb': 'mid', '#0891b2': 'leaf', '#86efac': 'instance',
  '#d97706': 'person', '#dc2626': 'place', '#db2777': 'event', '#6366f1': 'concept',
  '#14b8a6': 'process', '#8b5cf6': 'artifact',
  // 구 dark (light와 겹치지 않는 값만; #8b5cf6은 위에서 artifact로 처리)
  '#3b82f6': 'mid', '#06b6d4': 'leaf', '#4ade80': 'instance',
  '#f59e0b': 'person', '#ef4444': 'place', '#ec4899': 'event', '#818cf8': 'concept',
  '#2dd4bf': 'process', '#a78bfa': 'artifact',
  // 구 muted light (채도 낮춘 팔레트 — 보라 그라데이션 이전, 실사용 클래스가 여기 저장됨)
  '#6487b4': 'root', '#5794b7': 'mid', '#4e98a2': 'leaf', '#60a97b': 'instance',
  '#c09d59': 'person', '#c37760': 'place', '#c07296': 'event', '#8c86c1': 'concept',
  '#499c8b': 'process', '#ae7f5b': 'artifact',
  // 구 muted dark
  '#809fc6': 'root', '#74a9c9': 'mid', '#62b1bc': 'leaf', '#76bc90': 'instance',
  '#cfb277': 'person', '#d4917d': 'place', '#d08bab': 'event', '#a39ed1': 'concept',
  '#62bcaa': 'process', '#c39979': 'artifact',
};

/** 클래스 color(hex) → colorKey. 신규 팔레트 우선, 구 팔레트 레거시 폴백, 그래도 없으면 'root'. */
export function getColorKey(color: string): NodeColorKey {
  const entries = Object.entries(NODE_COLORS) as [NodeColorKey, string][];
  const direct = entries.find(([, v]) => v.toLowerCase() === color?.toLowerCase())?.[0];
  if (direct) return direct;
  return LEGACY_COLOR_KEY[color?.toLowerCase()] ?? 'root';
}

// 노드 크기는 "의미를 하나만" 인코딩한다 — 연결 차수(degree). sqrt로 완만하게, 상한으로 god node 캡.
const SIZE_MIN = 36;
const SIZE_MAX = 96;
const SIZE_K = 10;
/** 연결 차수에 따른 클래스 노드 지름(36~96, sqrt 스케일 + 상한). */
export function computeNodeSize(degree: number): number {
  return Math.round(Math.max(SIZE_MIN, Math.min(SIZE_MAX, SIZE_MIN + SIZE_K * Math.sqrt(Math.max(0, degree)))));
}

// 인스턴스는 알약(pill) 형태 유지 — 폭만 차수로 완만히 변동(높이는 스타일에서 고정).
const INST_MIN = 60;
const INST_MAX = 96;
const INST_K = 6;
export function computeInstanceWidth(degree: number): number {
  return Math.round(Math.max(INST_MIN, Math.min(INST_MAX, INST_MIN + INST_K * Math.sqrt(Math.max(0, degree)))));
}

/** 차수 상위 N개 노드 id 집합(라벨 LOD에서 줌아웃 시에도 라벨 유지할 허브). degree 0은 제외. */
export function selectHubIds(degrees: Map<string, number>, topN = 10): Set<string> {
  return new Set(
    [...degrees.entries()]
      .filter(([, d]) => d > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([id]) => id),
  );
}

// has-a(구성/속성) 패턴 — 관계명에 포함되면 has-a 엣지로 분류
export const HAS_A_PATTERNS = ['has', '포함', '속성', 'contains', 'owns'];

export function isHasARelation(relationName: string): boolean {
  const n = relationName.toLowerCase();
  return HAS_A_PATTERNS.some((p) => n.includes(p));
}

interface BuildInput {
  classes: OntologyClass[];
  instances: OntologyInstance[];
  edges: OntologyEdge[];
  relationTypes: { id: string; name: string }[];
}

function partitionOf(entity: object): string | undefined {
  return (entity as { partitionId?: string }).partitionId ?? undefined;
}

/** store 데이터를 Cytoscape elements 배열로 변환. */
export function buildElements({ classes, instances, edges, relationTypes }: BuildInput): ElementDefinition[] {
  const childClassIds = new Set(classes.filter((c) => c.parentId).map((c) => c.parentId!));
  const instanceCount = new Map<string, number>();
  instances.forEach((i) => instanceCount.set(i.classId, (instanceCount.get(i.classId) ?? 0) + 1));

  // 존재하는 노드 id 집합 — 끊긴(dangling) 엣지를 걸러 Cytoscape add 크래시 방지.
  // (이전 버전의 고아 인스턴스/엣지: 부모 클래스가 삭제됐는데 인스턴스·관계가 남은 경우)
  const classIdSet = new Set(classes.map((c) => c.id));
  const nodeIdSet = new Set<string>([...classIdSet, ...instances.map((i) => i.id)]);

  // is-a (상속): 부모 → 자식 (부모 클래스가 존재할 때만)
  const isaEdges: ElementDefinition[] = classes
    .filter((c) => c.parentId && classIdSet.has(c.parentId))
    .map((c) => ({
      group: 'edges',
      data: { id: `isa-${c.id}`, source: c.parentId!, target: c.id },
      classes: 'isa',
    }));

  // instance-of: 클래스 → 인스턴스 (소속 클래스가 존재할 때만)
  const instEdges: ElementDefinition[] = instances
    .filter((i) => classIdSet.has(i.classId))
    .map((i) => ({
      group: 'edges',
      data: { id: `inst-${i.id}`, source: i.classId, target: i.id },
      classes: 'instanceof',
    }));

  // relation / has-a: 관계 엣지 (양 끝 노드가 모두 존재할 때만)
  const relName = new Map(relationTypes.map((r) => [r.id, r.name]));
  const relEdges: ElementDefinition[] = edges
    .filter((e) => nodeIdSet.has(e.sourceId) && nodeIdSet.has(e.targetId))
    .map((e) => {
      const name = relName.get(e.relationTypeId) ?? '';
      const partitionId = partitionOf(e);
      const base = isHasARelation(name) ? 'hasa' : 'relation';
      return {
        group: 'edges',
        data: { id: e.id, source: e.sourceId, target: e.targetId, label: name, ...(partitionId ? { partitionId } : {}) },
        classes: e.isBridge ? `${base} bridge` : base,
      };
    });

  // ── 연결 차수(degree) 집계 ── 렌더되는 엣지(끊긴 엣지 제외)의 양 끝을 카운트.
  // 노드 크기·허브 라벨 LOD·차수 필터의 단일 인코딩 소스.
  const degrees = new Map<string, number>();
  const bump = (id: string) => degrees.set(id, (degrees.get(id) ?? 0) + 1);
  [...isaEdges, ...instEdges, ...relEdges].forEach((e) => {
    bump(String(e.data.source));
    bump(String(e.data.target));
  });
  const hubIds = selectHubIds(degrees);

  const classNodes: ElementDefinition[] = classes.map((cls) => {
    const count = instanceCount.get(cls.id) ?? 0;
    const degree = degrees.get(cls.id) ?? 0;
    const isEmpty = count === 0 && !childClassIds.has(cls.id);
    const partitionId = partitionOf(cls);
    return {
      group: 'nodes',
      data: {
        id: cls.id,
        kind: 'class',
        label: cls.name,
        // 표시 라벨(별도 슬롯): 평소엔 이름만. 접힌 클래스는 useCytoscape가 `이름 (N)`으로 동적 설정.
        // label(순수 이름)은 검색·컨텍스트 메뉴용으로 보존한다.
        displayLabel: cls.name,
        colorKey: getColorKey(cls.color),
        count,
        degree,
        size: computeNodeSize(degree),
        isHub: hubIds.has(cls.id),
        ...(partitionId ? { partitionId } : {}),
      },
      classes: isEmpty ? 'class empty' : 'class',
    };
  });

  const classById = new Map(classes.map((c) => [c.id, c]));
  const instanceNodes: ElementDefinition[] = instances.map((inst) => {
    const parent = classById.get(inst.classId);
    const degree = degrees.get(inst.id) ?? 0;
    const partitionId = parent ? partitionOf(parent) : undefined;
    return {
      group: 'nodes',
      data: {
        id: inst.id,
        kind: 'instance',
        classId: inst.classId,
        label: inst.name,
        colorKey: parent ? getColorKey(parent.color) : ('instance' as NodeColorKey),
        degree,
        size: computeInstanceWidth(degree),
        isHub: hubIds.has(inst.id),
        ...(partitionId ? { partitionId } : {}),
      },
      classes: 'instance',
    };
  });

  return [...classNodes, ...instanceNodes, ...isaEdges, ...instEdges, ...relEdges];
}

export interface ElementIdDiff {
  add: string[];
  remove: string[];
  keep: string[];
}

/** 이전 id 집합과 다음 elements를 비교해 add/remove/keep id 분류 (순수, 테스트 대상). */
export function diffElementIds(prevIds: string[], next: ElementDefinition[]): ElementIdDiff {
  const prev = new Set(prevIds);
  const nextIds = new Set(next.map((e) => String(e.data.id)));
  const add: string[] = [];
  const keep: string[] = [];
  next.forEach((e) => {
    const id = String(e.data.id);
    if (prev.has(id)) keep.push(id);
    else add.push(id);
  });
  const remove = prevIds.filter((id) => !nextIds.has(id));
  return { add, remove, keep };
}

// 데이터에서 파생되는 구조적 클래스 — sync 시 이것만 재조정하고 런타임 상태 클래스
// (dimmed/connected/pulse/hidden/zdot 등)는 보존한다.
const STRUCTURAL_CLASSES = ['class', 'instance', 'empty', 'isa', 'instanceof', 'hasa', 'relation', 'bridge'];

function applyStructuralClasses(el: { toggleClass: (cls: string, toggle: boolean) => unknown }, defClasses?: string | string[]): void {
  const want = new Set(
    typeof defClasses === 'string' ? defClasses.split(/\s+/).filter(Boolean) : Array.isArray(defClasses) ? defClasses : [],
  );
  STRUCTURAL_CLASSES.forEach((cls) => el.toggleClass(cls, want.has(cls)));
}

/**
 * cy 그래프를 next elements로 동기화. 전체 재생성 없이 add/remove + 기존 요소 data in-place update.
 * 런타임 상태 클래스는 보존. 신규로 추가된 노드 id 배열을 반환(증분 레이아웃용).
 */
export function syncCytoscape(cy: Core, next: ElementDefinition[]): string[] {
  const prevIds = cy.elements().map((el) => el.id());
  const { add, remove } = diffElementIds(prevIds, next);
  const byId = new Map(next.map((e) => [String(e.data.id), e]));

  cy.batch(() => {
    remove.forEach((id) => {
      cy.getElementById(id).remove();
    });

    // 기존 요소 data + 구조 클래스 갱신 (label·size·colorKey·empty·hasa↔relation 등)
    // PRD-Perf M1-5: 실제로 값이 바뀐 키만 갱신 — 미변경 요소 전체로 스타일
    // 무효화가 번지던 것을 차단(노드 1개 추가가 전 요소 재계산을 유발하지 않게).
    cy.elements().forEach((el) => {
      const def = byId.get(el.id());
      if (!def) return;
      const current = el.data() as Record<string, unknown>;
      const nextData = def.data as unknown as Record<string, unknown>;
      Object.keys(nextData).forEach((key) => {
        if (current[key] !== nextData[key]) el.data(key, nextData[key]);
      });
      applyStructuralClasses(el, def.classes);
    });

    // 신규 추가 — 엣지는 양 끝 노드가 그래프(기존+신규)에 있을 때만(끊긴 엣지 방어)
    if (add.length) {
      const present = new Set<string>([...cy.nodes().map((n) => n.id())]);
      add.forEach((id) => {
        const def = byId.get(id);
        if (def?.group === 'nodes' || (def && !def.data.source)) present.add(id);
      });
      const toAdd = add
        .map((id) => byId.get(id)!)
        .filter((def) => {
          const isEdge = def.group === 'edges' || !!def.data.source;
          if (!isEdge) return true;
          return present.has(String(def.data.source)) && present.has(String(def.data.target));
        });
      if (toAdd.length) cy.add(toAdd);
    }
  });

  return add;
}
