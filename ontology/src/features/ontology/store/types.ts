'use client';

import type { StateCreator } from 'zustand';
import type {
  OntologyClass,
  OntologyInstance,
  OntologyProperty,
  RelationType,
  OntologyEdge,
  OntologyAxiom,
  InstanceValue,
  Change,
  PopoverState,
  Partition,
} from '../lib/types';
import type { OntologyAction } from '../lib/schemas';

export interface ApplyActionsResult {
  applied: string[]; // ids of created/updated nodes (for canvas highlight)
  skipped: { label: string; reason: string }[];
}

export interface MergeResult {
  ok: boolean;
  reason?: string;
}

// ── Entity Slice ──────────────────────────────────────────────

export interface EntitySlice {
  classes: OntologyClass[];
  instances: OntologyInstance[];
  properties: OntologyProperty[];
  relationTypes: RelationType[];
  edges: OntologyEdge[];
  axioms: OntologyAxiom[];
  instanceValues: InstanceValue[];
  // PRD-B B-1/B-3: 구획 목록 (렌더러/전환기용)
  partitions: Partition[];

  addClass: (data: Partial<OntologyClass> & { name: string }) => string;
  updateClass: (id: string, data: Partial<OntologyClass>) => void;
  removeClass: (id: string) => void;

  addInstance: (data: Partial<OntologyInstance> & { name: string; classId: string }) => string;
  updateInstance: (id: string, data: Partial<OntologyInstance>) => void;
  removeInstance: (id: string) => void;

  setInstanceValue: (instanceId: string, propertyId: string, value: string) => void;

  addProperty: (data: Partial<OntologyProperty> & { name: string; classId: string }) => string;
  removeProperty: (id: string) => void;

  addRelationType: (data: Partial<RelationType> & { name: string }) => string;
  addEdge: (data: Partial<OntologyEdge> & { sourceId: string; targetId: string; relationTypeId: string }) => string;
  removeEdge: (id: string) => void;

  addAxiom: (data: Partial<OntologyAxiom> & { description: string }) => string;
  removeAxiom: (id: string) => void;

  deleteSelectedNode: () => void;
  deleteNodeById: (id: string, type: 'class' | 'instance') => void;
  clearOntology: () => void;

  // Compound, single-undo actions (P0-1 / P0-2)
  applyAssistantActions: (actions: OntologyAction[]) => ApplyActionsResult;
  mergeEntities: (
    survivorId: string,
    mergedId: string,
    kind: 'class' | 'instance',
  ) => MergeResult;

  loadOntology: (data: {
    classes: OntologyClass[];
    instances: OntologyInstance[];
    properties: OntologyProperty[];
    relationTypes: RelationType[];
    edges: OntologyEdge[];
    axioms: OntologyAxiom[];
    instanceValues: InstanceValue[];
    partitions?: Partition[];
  }) => void;
}

// ── UI Slice ──────────────────────────────────────────────────

export interface UiSlice {
  selectedNodeId: string | null;
  selectedNodeType: 'class' | 'instance' | null;
  popoverState: PopoverState | null;
  expandedNodes: Set<string>;
  focusNodeId: string | null;
  highlightNodeIds: string[];
  toolMode: 'select' | 'pan';
  // 읽기(read)/편집(edit) 모드 — 렌더러 비종속 UI 상호작용 상태(엔진 재생성 없음).
  // read: 드래그 이동·선택·줌·팬·포커스·필터 허용 / 드래그-연결·드래그-onto 계층생성 비활성.
  // edit: 드래그-연결(edgehandles)·드래그-onto 계층생성 활성.
  editMode: 'read' | 'edit';
  // PRD-B B-3: 현재 구획 + 전체 보기 토글
  currentPartitionId: string | null;
  showAllPartitions: boolean;
  zoomAction: 'in' | 'out' | 'fit' | null;

  // Filter state (P1-4) — colorFilter stored as array to avoid Zustand Set serialization issues
  showClasses: boolean;
  showInstances: boolean;
  colorFilter: string[];
  // 차수 필터 — 이 값 미만 차수의 노드를 숨김(잡음 노드 제거). 0이면 전체 표시.
  minDegree: number;
  focusModeNodeId: string | null;
  focusDepth: number;

  selectNode: (id: string, type: 'class' | 'instance') => void;
  clearSelection: () => void;

  openPopover: (state: PopoverState) => void;
  closePopover: () => void;

  toggleExpanded: (nodeId: string) => void;
  setExpanded: (nodeId: string, expanded: boolean) => void;

  focusNode: (nodeId: string) => void;
  clearFocus: () => void;

  highlightNodes: (ids: string[]) => void;
  clearHighlight: () => void;

  setToolMode: (mode: 'select' | 'pan') => void;
  setEditMode: (mode: 'read' | 'edit') => void;
  selectPartition: (partitionId: string | null) => void;
  toggleShowAllPartitions: (show: boolean) => void;
  triggerZoom: (action: 'in' | 'out' | 'fit') => void;
  clearZoomAction: () => void;

  // Filter actions (P1-4)
  setShowClasses: (show: boolean) => void;
  setShowInstances: (show: boolean) => void;
  toggleColorFilter: (color: string) => void;
  clearColorFilter: () => void;
  setMinDegree: (degree: number) => void;
  enterFocusMode: (nodeId: string, depth?: number) => void;
  exitFocusMode: () => void;
  setFocusDepth: (depth: number) => void;
}

// ── History Slice ─────────────────────────────────────────────

export interface HistorySlice {
  pendingChanges: Change[];

  addChange: (change: Omit<Change, 'id' | 'timestamp'>) => void;
  clearChanges: () => void;
}

// ── Combined Store ────────────────────────────────────────────

export type OntologyStore = EntitySlice & UiSlice & HistorySlice;

export type SliceCreator<T> = StateCreator<OntologyStore, [], [], T>;
