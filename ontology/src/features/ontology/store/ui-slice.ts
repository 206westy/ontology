'use client';

import type { UiSlice, SliceCreator } from './types';
import { DEFAULT_PARTITION_ID } from '../lib/types';

export const createUiSlice: SliceCreator<UiSlice> = (set) => ({
  selectedNodeId: null,
  selectedNodeType: null,
  popoverState: null,
  expandedNodes: new Set<string>(),
  focusNodeId: null,
  highlightNodeIds: [],
  toolMode: 'select' as const,
  editMode: 'read' as const,
  currentPartitionId: DEFAULT_PARTITION_ID,
  showAllPartitions: false,
  zoomAction: null,
  aiExpandRequest: null,
  activePattern: null,
  activePatternCq: null,
  entityResolutionOpen: false,

  // Filter defaults (P1-4)
  showClasses: true,
  showInstances: true,
  colorFilter: [],
  minDegree: 0,
  focusModeNodeId: null,
  focusDepth: 1,

  selectNode: (id, type) => set({ selectedNodeId: id, selectedNodeType: type }),
  clearSelection: () => set({ selectedNodeId: null, selectedNodeType: null }),

  // 진입점에서 호출: 노드를 선택하고 AI 확장 신호를 올린다. 이름/타입은 현재
  // 엔티티에서 해석한다. 대상 노드를 못 찾으면 무시(no-op).
  requestNodeExpansion: (nodeId) =>
    set((state) => {
      const cls = state.classes.find((c) => c.id === nodeId);
      const inst = cls ? undefined : state.instances.find((i) => i.id === nodeId);
      if (!cls && !inst) return {};
      const nodeType: 'class' | 'instance' = cls ? 'class' : 'instance';
      const nodeName = cls ? cls.name : inst!.name;
      const nonce = (state.aiExpandRequest?.nonce ?? 0) + 1;
      return {
        selectedNodeId: nodeId,
        selectedNodeType: nodeType,
        aiExpandRequest: { nodeId, nodeName, nodeType, nonce },
      };
    }),

  consumeAiExpandRequest: () => set({ aiExpandRequest: null }),

  openPopover: (popoverState) => set({ popoverState }),
  closePopover: () => set({ popoverState: null }),

  setActivePattern: (pattern) => set({ activePattern: pattern }),
  setActivePatternCq: (cq) => set({ activePatternCq: cq }),
  openEntityResolution: () => set({ entityResolutionOpen: true }),
  closeEntityResolution: () => set({ entityResolutionOpen: false }),

  toggleExpanded: (nodeId) =>
    set((state) => {
      const next = new Set(state.expandedNodes);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return { expandedNodes: next };
    }),

  setExpanded: (nodeId, expanded) =>
    set((state) => {
      const next = new Set(state.expandedNodes);
      if (expanded) {
        next.add(nodeId);
      } else {
        next.delete(nodeId);
      }
      return { expandedNodes: next };
    }),

  focusNode: (nodeId) => set({ focusNodeId: nodeId }),
  clearFocus: () => set({ focusNodeId: null }),

  highlightNodes: (ids) => set({ highlightNodeIds: ids }),
  clearHighlight: () => set({ highlightNodeIds: [] }),

  setToolMode: (mode) => set({ toolMode: mode }),
  setEditMode: (mode) => set({ editMode: mode }),
  selectPartition: (partitionId) => set({ currentPartitionId: partitionId, showAllPartitions: false }),
  toggleShowAllPartitions: (show) => set({ showAllPartitions: show }),
  triggerZoom: (action) => set({ zoomAction: action }),
  clearZoomAction: () => set({ zoomAction: null }),

  // Filter actions (P1-4)
  setShowClasses: (show) => set({ showClasses: show }),
  setShowInstances: (show) => set({ showInstances: show }),
  toggleColorFilter: (color) =>
    set((state) => {
      const has = state.colorFilter.includes(color);
      return {
        colorFilter: has
          ? state.colorFilter.filter((c) => c !== color)
          : [...state.colorFilter, color],
      };
    }),
  clearColorFilter: () => set({ colorFilter: [] }),
  setMinDegree: (degree) => set({ minDegree: Math.max(0, Math.round(degree)) }),
  enterFocusMode: (nodeId, depth = 1) =>
    set({ focusModeNodeId: nodeId, focusDepth: depth }),
  exitFocusMode: () => set({ focusModeNodeId: null }),
  setFocusDepth: (depth) => set({ focusDepth: depth }),
});
