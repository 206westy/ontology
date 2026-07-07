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
import type { ActionPlan } from '../lib/plan-actions';
import type { PatternTraversalTemplate } from '../lib/patterns/types';

// PRD-H (H7/M5): 활성 패턴의 CQ 번들(검수의 CQ 통과율 표시용). 발행 라이선스와
// 별개로, 마지막 패턴 시드 생성의 competencyQuestions + traversalTemplates 를 들고 있는다.
export interface ActivePatternCq {
  competencyQuestions: string[];
  traversalTemplates: PatternTraversalTemplate[];
}

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
  // 읽기 전용: 적용 전 미리보기(생성/수정/skip + 사유). applyAssistantActions 와
  // 동일 규칙을 공유한다(plan-actions). store 를 변형하지 않는다.
  previewAssistantActions: (actions: OntologyAction[]) => ActionPlan;
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
  // PRD-J M2: 현재 체크아웃된 브랜치(null = main).
  // 브랜치 모드에서는 엔티티 라이브 싱크(useApiSync)와 main 로드(useLoadOntology)가
  // 중단되고, 커밋은 branchId 를 달고 저장된다(main 엔티티 미적용).
  currentBranch: { id: string; name: string } | null;
  zoomAction: 'in' | 'out' | 'fit' | null;

  // 노드 기준 AI 확장 요청 — 진입점(컨텍스트 메뉴/패널 버튼)이 설정하고
  // AIAssistantTab이 소비해 확장 프롬프트를 자동 투입한다. nonce로 재요청 구분.
  aiExpandRequest: { nodeId: string; nodeName: string; nodeType: 'class' | 'instance'; nonce: number } | null;

  // PRD-H (M2): 마지막 패턴 시드 생성에 사용된 패턴(발행 라이선스 경고·머지 트리거용).
  // license 가 미확인이면 NeoConfirmSheet 가 경고를 띄운다.
  activePattern: { id: string | null; name: string; license: string | null } | null;
  // PRD-H (H7/M5): 마지막 패턴 시드 생성의 CQ 번들(검수의 CQ 통과율 표시용). 없으면 null.
  activePatternCq: ActivePatternCq | null;
  // PRD-H H8-c (M2): 패턴 시드 생성 후 기존 EntityResolutionSheet(머지 미리보기) 노출 트리거.
  entityResolutionOpen: boolean;

  // PRD-I (M2): 가이드 여정(패턴 발견→검수) 오버레이 노출 여부와 초기 씨앗 텍스트.
  // 어디서든(빈 캔버스/툴바) openGuided 로 열어 단일 GuidedJourney 로 라우팅한다.
  guidedOpen: boolean;
  guidedInitialText: string | null;

  // PRD-I (M4): 라이프사이클 프레이밍(초안→확정→발행) 파생용 세션 타임스탬프.
  // 확정 = 수동 커밋(Supabase 저장) 성공 시각, 발행 = Neo4j 푸시 성공 시각.
  // UI 슬라이스 소속이라 undo/redo(temporal partialize) 대상이 아니다 — 발행 이력을
  // 되돌리기로 되살리면 안 되기 때문. 없으면 null.
  lastCommittedAt: string | null;
  lastPublishedAt: string | null;

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
  requestNodeExpansion: (nodeId: string) => void;
  consumeAiExpandRequest: () => void;

  openPopover: (state: PopoverState) => void;
  closePopover: () => void;

  // PRD-H (M2): 활성 패턴 기록 + 머지 미리보기 시트 토글.
  setActivePattern: (
    pattern: { id: string | null; name: string; license: string | null } | null,
  ) => void;
  // PRD-H (H7/M5): 활성 패턴 CQ 번들 기록(검수 CQ 통과율용).
  setActivePatternCq: (cq: ActivePatternCq | null) => void;
  openEntityResolution: () => void;
  closeEntityResolution: () => void;
  // PRD-I (M2): 가이드 여정 열기(선택적 씨앗 텍스트) / 닫기.
  openGuided: (initialText?: string) => void;
  closeGuided: () => void;
  // PRD-I (M4): 수동 커밋/발행 성공 시점 기록(라이프사이클 상태 파생용).
  markCommitted: () => void;
  markPublished: () => void;

  toggleExpanded: (nodeId: string) => void;
  setExpanded: (nodeId: string, expanded: boolean) => void;

  focusNode: (nodeId: string) => void;
  clearFocus: () => void;

  highlightNodes: (ids: string[]) => void;
  clearHighlight: () => void;

  setToolMode: (mode: 'select' | 'pan') => void;
  setEditMode: (mode: 'read' | 'edit') => void;
  // PRD-J M2: 브랜치 체크아웃 상태 전환(데이터 적재는 useBranches 훅이 담당).
  setCurrentBranch: (branch: { id: string; name: string } | null) => void;
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
