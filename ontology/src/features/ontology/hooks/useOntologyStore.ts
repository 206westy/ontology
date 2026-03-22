'use client';

import { create } from 'zustand';
import { useStore } from 'zustand';
import { temporal } from 'zundo';
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
  ChangeOperation,
} from '../lib/types';

interface OntologyStore {
  // Graph data
  classes: OntologyClass[];
  instances: OntologyInstance[];
  properties: OntologyProperty[];
  relationTypes: RelationType[];
  edges: OntologyEdge[];
  axioms: OntologyAxiom[];
  instanceValues: InstanceValue[];

  // UI state
  selectedNodeId: string | null;
  selectedNodeType: 'class' | 'instance' | null;
  pendingChanges: Change[];
  popoverState: PopoverState | null;
  expandedNodes: Set<string>;
  focusNodeId: string | null;
  toolMode: 'select' | 'pan';
  zoomAction: 'in' | 'out' | 'fit' | null;

  // Actions — selection
  selectNode: (id: string, type: 'class' | 'instance') => void;
  clearSelection: () => void;

  // Actions — classes (returns generated ID)
  addClass: (data: Partial<OntologyClass> & { name: string }) => string;
  updateClass: (id: string, data: Partial<OntologyClass>) => void;
  removeClass: (id: string) => void;

  // Actions — instances
  addInstance: (data: Partial<OntologyInstance> & { name: string; classId: string }) => string;
  updateInstance: (id: string, data: Partial<OntologyInstance>) => void;
  removeInstance: (id: string) => void;

  // Actions — instance values
  setInstanceValue: (instanceId: string, propertyId: string, value: string) => void;

  // Actions — properties
  addProperty: (data: Partial<OntologyProperty> & { name: string; classId: string }) => string;
  removeProperty: (id: string) => void;

  // Actions — edges & relations (returns generated ID)
  addRelationType: (data: Partial<RelationType> & { name: string }) => string;
  addEdge: (data: Partial<OntologyEdge> & { sourceId: string; targetId: string; relationTypeId: string }) => string;
  removeEdge: (id: string) => void;

  // Actions — axioms
  addAxiom: (data: Partial<OntologyAxiom> & { description: string }) => string;
  removeAxiom: (id: string) => void;

  // Actions — delete selected node (class or instance) with cascade
  deleteSelectedNode: () => void;

  // Actions — changes
  addChange: (change: Omit<Change, 'id' | 'timestamp'>) => void;
  clearChanges: () => void;

  // Actions — popover
  openPopover: (state: PopoverState) => void;
  closePopover: () => void;

  // Actions — tree
  toggleExpanded: (nodeId: string) => void;
  setExpanded: (nodeId: string, expanded: boolean) => void;

  // Actions — focus
  focusNode: (nodeId: string) => void;
  clearFocus: () => void;

  // Actions — toolbar
  setToolMode: (mode: 'select' | 'pan') => void;
  triggerZoom: (action: 'in' | 'out' | 'fit') => void;
  clearZoomAction: () => void;

  // Actions — bulk load
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

function generateId(): string {
  return crypto.randomUUID();
}

function toSnapshot(obj: Record<string, unknown> | undefined | null): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  // Strip internal-only fields, keep data relevant for Neo4j rollback
  const { createdAt, updatedAt, ...rest } = obj as Record<string, unknown>;
  return rest;
}

function createChange(
  operation: ChangeOperation,
  targetTable: string,
  targetId: string,
  targetName: string,
  beforeSnapshot?: Record<string, unknown>,
  afterSnapshot?: Record<string, unknown>,
): Change {
  return {
    id: generateId(),
    operation,
    targetTable,
    targetId,
    targetName,
    timestamp: new Date().toISOString(),
    beforeSnapshot: toSnapshot(beforeSnapshot),
    afterSnapshot: toSnapshot(afterSnapshot),
  };
}

export const useOntologyStore = create<OntologyStore>()(
  temporal(
    (set, get) => ({
      // Initial state
      classes: [],
      instances: [],
      properties: [],
      relationTypes: [],
      edges: [],
      axioms: [],
      instanceValues: [],
      selectedNodeId: null,
      selectedNodeType: null,
      pendingChanges: [],
      popoverState: null,
      expandedNodes: new Set<string>(),
      focusNodeId: null,
      toolMode: 'select' as const,
      zoomAction: null,

      // Selection
      selectNode: (id, type) => set({ selectedNodeId: id, selectedNodeType: type }),
      clearSelection: () => set({ selectedNodeId: null, selectedNodeType: null }),

      // Classes — returns the ID of the created class
      addClass: (data) => {
        const id = data.id ?? generateId();
        const newClass: OntologyClass = {
          id,
          parentId: data.parentId ?? null,
          name: data.name,
          description: data.description ?? '',
          color: data.color ?? '#7c3aed',
          positionX: data.positionX ?? 0,
          positionY: data.positionY ?? 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          classes: [...state.classes, newClass],
          pendingChanges: [
            ...state.pendingChanges,
            createChange('ADD', 'classes', newClass.id, newClass.name, undefined, newClass as unknown as Record<string, unknown>),
          ],
        }));
        return id;
      },

      updateClass: (id, data) =>
        set((state) => {
          const existing = state.classes.find((c) => c.id === id);
          const merged = existing ? { ...existing, ...data, updatedAt: new Date().toISOString() } : undefined;
          return {
            classes: state.classes.map((c) =>
              c.id === id ? { ...c, ...data, updatedAt: new Date().toISOString() } : c,
            ),
            pendingChanges: [
              ...state.pendingChanges,
              createChange('MOD', 'classes', id, data.name ?? existing?.name ?? '',
                existing as unknown as Record<string, unknown>,
                merged as unknown as Record<string, unknown>),
            ],
          };
        }),

      removeClass: (id) =>
        set((state) => {
          const existing = state.classes.find((c) => c.id === id);
          return {
            classes: state.classes.filter((c) => c.id !== id),
            pendingChanges: [
              ...state.pendingChanges,
              createChange('DEL', 'classes', id, existing?.name ?? '',
                existing as unknown as Record<string, unknown>),
            ],
          };
        }),

      // Instances — returns ID
      addInstance: (data) => {
        const id = data.id ?? generateId();
        const newInstance: OntologyInstance = {
          id,
          classId: data.classId,
          name: data.name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          instances: [...state.instances, newInstance],
          pendingChanges: [
            ...state.pendingChanges,
            createChange('ADD', 'instances', newInstance.id, newInstance.name, undefined, newInstance as unknown as Record<string, unknown>),
          ],
        }));
        return id;
      },

      updateInstance: (id, data) =>
        set((state) => {
          const existing = state.instances.find((i) => i.id === id);
          const merged = existing ? { ...existing, ...data, updatedAt: new Date().toISOString() } : undefined;
          return {
            instances: state.instances.map((i) =>
              i.id === id ? { ...i, ...data, updatedAt: new Date().toISOString() } : i,
            ),
            pendingChanges: [
              ...state.pendingChanges,
              createChange('MOD', 'instances', id, data.name ?? existing?.name ?? '',
                existing as unknown as Record<string, unknown>,
                merged as unknown as Record<string, unknown>),
            ],
          };
        }),

      removeInstance: (id) =>
        set((state) => {
          const existing = state.instances.find((i) => i.id === id);
          return {
            instances: state.instances.filter((i) => i.id !== id),
            edges: state.edges.filter((e) => e.sourceId !== id && e.targetId !== id),
            instanceValues: state.instanceValues.filter((iv) => iv.instanceId !== id),
            pendingChanges: [
              ...state.pendingChanges,
              createChange('DEL', 'instances', id, existing?.name ?? '',
                existing as unknown as Record<string, unknown>),
            ],
            selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
            selectedNodeType: state.selectedNodeId === id ? null : state.selectedNodeType,
          };
        }),

      setInstanceValue: (instanceId, propertyId, value) =>
        set((state) => {
          const existing = state.instanceValues.find(
            (iv) => iv.instanceId === instanceId && iv.propertyId === propertyId,
          );
          if (existing) {
            return {
              instanceValues: state.instanceValues.map((iv) =>
                iv.id === existing.id ? { ...iv, value } : iv,
              ),
              pendingChanges: [
                ...state.pendingChanges,
                createChange('MOD', 'instance_values', existing.id, value,
                  existing as unknown as Record<string, unknown>,
                  { ...existing, value } as unknown as Record<string, unknown>),
              ],
            };
          }
          const newIv: InstanceValue = {
            id: generateId(),
            instanceId,
            propertyId,
            value,
          };
          return {
            instanceValues: [...state.instanceValues, newIv],
            pendingChanges: [
              ...state.pendingChanges,
              createChange('ADD', 'instance_values', newIv.id, value, undefined, newIv as unknown as Record<string, unknown>),
            ],
          };
        }),

      // Delete selected node with cascade
      deleteSelectedNode: () =>
        set((state) => {
          const { selectedNodeId, selectedNodeType } = state;
          if (!selectedNodeId || !selectedNodeType) return state;

          if (selectedNodeType === 'class') {
            const cls = state.classes.find((c) => c.id === selectedNodeId);
            if (!cls) return state;

            const deletedInstances = state.instances.filter((i) => i.classId === selectedNodeId);
            const instanceIds = deletedInstances.map((i) => i.id);
            const affectedNodeIds = new Set([selectedNodeId, ...instanceIds]);
            const deletedProperties = state.properties.filter((p) => p.classId === selectedNodeId);
            const deletedEdges = state.edges.filter((e) => affectedNodeIds.has(e.sourceId) || affectedNodeIds.has(e.targetId));
            const deletedAxioms = state.axioms.filter((a) => a.classIds.includes(selectedNodeId));

            const cascadeChanges: Change[] = [
              createChange('DEL', 'classes', selectedNodeId, cls.name,
                cls as unknown as Record<string, unknown>),
              ...deletedInstances.map((i) => createChange('DEL', 'instances', i.id, i.name,
                i as unknown as Record<string, unknown>)),
              ...deletedProperties.map((p) => createChange('DEL', 'properties', p.id, p.name,
                p as unknown as Record<string, unknown>)),
              ...deletedEdges.map((e) => createChange('DEL', 'edges', e.id, state.relationTypes.find((r) => r.id === e.relationTypeId)?.name ?? 'relation',
                { ...e, relationTypeName: state.relationTypes.find((r) => r.id === e.relationTypeId)?.name } as unknown as Record<string, unknown>)),
              ...deletedAxioms.map((a) => createChange('DEL', 'axioms', a.id, a.description,
                a as unknown as Record<string, unknown>)),
            ];

            return {
              classes: state.classes
                .filter((c) => c.id !== selectedNodeId)
                .map((c) => c.parentId === selectedNodeId ? { ...c, parentId: null } : c),
              instances: state.instances.filter((i) => i.classId !== selectedNodeId),
              properties: state.properties.filter((p) => p.classId !== selectedNodeId),
              edges: state.edges.filter((e) => !affectedNodeIds.has(e.sourceId) && !affectedNodeIds.has(e.targetId)),
              axioms: state.axioms.filter((a) => !a.classIds.includes(selectedNodeId)),
              instanceValues: state.instanceValues.filter((iv) => !instanceIds.includes(iv.instanceId)),
              selectedNodeId: null,
              selectedNodeType: null,
              pendingChanges: [...state.pendingChanges, ...cascadeChanges],
            };
          }

          if (selectedNodeType === 'instance') {
            const inst = state.instances.find((i) => i.id === selectedNodeId);
            if (!inst) return state;

            const deletedEdges = state.edges.filter((e) => e.sourceId === selectedNodeId || e.targetId === selectedNodeId);
            const instanceCascadeChanges: Change[] = [
              createChange('DEL', 'instances', selectedNodeId, inst.name,
                inst as unknown as Record<string, unknown>),
              ...deletedEdges.map((e) => createChange('DEL', 'edges', e.id, state.relationTypes.find((r) => r.id === e.relationTypeId)?.name ?? 'relation',
                { ...e, relationTypeName: state.relationTypes.find((r) => r.id === e.relationTypeId)?.name } as unknown as Record<string, unknown>)),
            ];

            return {
              instances: state.instances.filter((i) => i.id !== selectedNodeId),
              edges: state.edges.filter((e) => e.sourceId !== selectedNodeId && e.targetId !== selectedNodeId),
              instanceValues: state.instanceValues.filter((iv) => iv.instanceId !== selectedNodeId),
              selectedNodeId: null,
              selectedNodeType: null,
              pendingChanges: [...state.pendingChanges, ...instanceCascadeChanges],
            };
          }

          return state;
        }),

      // Properties — returns ID
      addProperty: (data) => {
        const id = data.id ?? generateId();
        const newProp: OntologyProperty = {
          id,
          classId: data.classId,
          name: data.name,
          dataType: data.dataType ?? 'string',
          isRequired: data.isRequired ?? false,
          enumValues: data.enumValues ?? null,
          constraintRule: data.constraintRule ?? null,
          sortOrder: data.sortOrder ?? 0,
        };
        set((state) => ({
          properties: [...state.properties, newProp],
          pendingChanges: [
            ...state.pendingChanges,
            createChange('ADD', 'properties', newProp.id, newProp.name, undefined, newProp as unknown as Record<string, unknown>),
          ],
        }));
        return id;
      },

      removeProperty: (id) =>
        set((state) => {
          const existing = state.properties.find((p) => p.id === id);
          return {
            properties: state.properties.filter((p) => p.id !== id),
            pendingChanges: [
              ...state.pendingChanges,
              createChange('DEL', 'properties', id, existing?.name ?? '',
                existing as unknown as Record<string, unknown>),
            ],
          };
        }),

      // Relation types — returns ID
      addRelationType: (data) => {
        const id = data.id ?? generateId();
        const newType: RelationType = {
          id,
          name: data.name,
          description: data.description ?? '',
          sourceClassId: data.sourceClassId ?? '',
          targetClassId: data.targetClassId ?? '',
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          relationTypes: [...state.relationTypes, newType],
          pendingChanges: [
            ...state.pendingChanges,
            createChange('ADD', 'relation_types', newType.id, newType.name, undefined, newType as unknown as Record<string, unknown>),
          ],
        }));
        return id;
      },

      // Edges — returns ID
      addEdge: (data) => {
        const id = data.id ?? generateId();
        const newEdge: OntologyEdge = {
          id,
          relationTypeId: data.relationTypeId,
          sourceId: data.sourceId,
          targetId: data.targetId,
          sourceKind: data.sourceKind ?? 'class',
          targetKind: data.targetKind ?? 'class',
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          edges: [...state.edges, newEdge],
          pendingChanges: [
            ...state.pendingChanges,
            createChange('ADD', 'edges', newEdge.id, state.relationTypes.find((r) => r.id === data.relationTypeId)?.name ?? 'relation',
              undefined, { ...newEdge, relationTypeName: state.relationTypes.find((r) => r.id === data.relationTypeId)?.name } as unknown as Record<string, unknown>),
          ],
        }));
        return id;
      },

      removeEdge: (id) =>
        set((state) => {
          const existing = state.edges.find((e) => e.id === id);
          return {
            edges: state.edges.filter((e) => e.id !== id),
            pendingChanges: [
              ...state.pendingChanges,
              createChange('DEL', 'edges', id, state.relationTypes.find((r) => r.id === existing?.relationTypeId)?.name ?? 'relation',
                existing ? { ...existing, relationTypeName: state.relationTypes.find((r) => r.id === existing.relationTypeId)?.name } as unknown as Record<string, unknown> : undefined),
            ],
          };
        }),

      // Axioms — returns ID
      addAxiom: (data) => {
        const id = data.id ?? generateId();
        const newAxiom: OntologyAxiom = {
          id,
          description: data.description,
          ruleLogic: data.ruleLogic ?? null,
          severity: data.severity ?? 'warning',
          classIds: data.classIds ?? [],
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          axioms: [...state.axioms, newAxiom],
          pendingChanges: [
            ...state.pendingChanges,
            createChange('ADD', 'axioms', newAxiom.id, newAxiom.description, undefined, newAxiom as unknown as Record<string, unknown>),
          ],
        }));
        return id;
      },

      removeAxiom: (id) =>
        set((state) => {
          const existing = state.axioms.find((a) => a.id === id);
          return {
            axioms: state.axioms.filter((a) => a.id !== id),
            pendingChanges: [
              ...state.pendingChanges,
              createChange('DEL', 'axioms', id, existing?.description ?? '',
                existing as unknown as Record<string, unknown>),
            ],
          };
        }),

      // Changes
      addChange: (change) =>
        set((state) => ({
          pendingChanges: [
            ...state.pendingChanges,
            { ...change, id: generateId(), timestamp: new Date().toISOString() },
          ],
        })),

      clearChanges: () => set({ pendingChanges: [] }),

      // Popover
      openPopover: (popoverState) => set({ popoverState }),
      closePopover: () => set({ popoverState: null }),

      // Tree
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

      // Focus
      focusNode: (nodeId) => set({ focusNodeId: nodeId }),
      clearFocus: () => set({ focusNodeId: null }),

      // Toolbar
      setToolMode: (mode) => set({ toolMode: mode }),
      triggerZoom: (action) => set({ zoomAction: action }),
      clearZoomAction: () => set({ zoomAction: null }),

      // Bulk load
      loadOntology: (data) => set({ ...data, pendingChanges: [], selectedNodeId: null, selectedNodeType: null }),
    }),
    {
      partialize: (state) => ({
        classes: state.classes,
        instances: state.instances,
        properties: state.properties,
        relationTypes: state.relationTypes,
        edges: state.edges,
        axioms: state.axioms,
        instanceValues: state.instanceValues,
        pendingChanges: state.pendingChanges,
      }),
      limit: 50,
    },
  ),
);

// Export temporal store accessor for undo/redo
type TemporalState = ReturnType<typeof useOntologyStore.temporal.getState>;

export const useTemporalStore = <T>(selector: (state: TemporalState) => T): T => {
  return useStore(useOntologyStore.temporal, selector);
};
