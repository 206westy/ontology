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
} from '../lib/types';

// ── Entity Slice ──────────────────────────────────────────────

export interface EntitySlice {
  classes: OntologyClass[];
  instances: OntologyInstance[];
  properties: OntologyProperty[];
  relationTypes: RelationType[];
  edges: OntologyEdge[];
  axioms: OntologyAxiom[];
  instanceValues: InstanceValue[];

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

  loadOntology: (data: {
    classes: OntologyClass[];
    instances: OntologyInstance[];
    properties: OntologyProperty[];
    relationTypes: RelationType[];
    edges: OntologyEdge[];
    axioms: OntologyAxiom[];
    instanceValues: InstanceValue[];
  }) => void;
}

// ── UI Slice ──────────────────────────────────────────────────

export interface UiSlice {
  selectedNodeId: string | null;
  selectedNodeType: 'class' | 'instance' | null;
  popoverState: PopoverState | null;
  expandedNodes: Set<string>;
  focusNodeId: string | null;
  toolMode: 'select' | 'pan';
  zoomAction: 'in' | 'out' | 'fit' | null;

  // Filter state (P1-4) — colorFilter stored as array to avoid Zustand Set serialization issues
  showClasses: boolean;
  showInstances: boolean;
  colorFilter: string[];
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

  setToolMode: (mode: 'select' | 'pan') => void;
  triggerZoom: (action: 'in' | 'out' | 'fit') => void;
  clearZoomAction: () => void;

  // Filter actions (P1-4)
  setShowClasses: (show: boolean) => void;
  setShowInstances: (show: boolean) => void;
  toggleColorFilter: (color: string) => void;
  clearColorFilter: () => void;
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
