'use client';

import type { UiSlice, SliceCreator } from './types';

export const createUiSlice: SliceCreator<UiSlice> = (set) => ({
  selectedNodeId: null,
  selectedNodeType: null,
  popoverState: null,
  expandedNodes: new Set<string>(),
  focusNodeId: null,
  highlightNodeIds: [],
  toolMode: 'select' as const,
  zoomAction: null,

  // Filter defaults (P1-4)
  showClasses: true,
  showInstances: true,
  colorFilter: [],
  focusModeNodeId: null,
  focusDepth: 1,

  selectNode: (id, type) => set({ selectedNodeId: id, selectedNodeType: type }),
  clearSelection: () => set({ selectedNodeId: null, selectedNodeType: null }),

  openPopover: (popoverState) => set({ popoverState }),
  closePopover: () => set({ popoverState: null }),

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
  enterFocusMode: (nodeId, depth = 1) =>
    set({ focusModeNodeId: nodeId, focusDepth: depth }),
  exitFocusMode: () => set({ focusModeNodeId: null }),
  setFocusDepth: (depth) => set({ focusDepth: depth }),
});
