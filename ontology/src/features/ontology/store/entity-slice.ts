'use client';

import type {
  OntologyClass,
  OntologyInstance,
  OntologyProperty,
  RelationType,
  OntologyEdge,
  OntologyAxiom,
  InstanceValue,
  Change,
  ChangeOperation,
} from '../lib/types';
import type { EntitySlice, SliceCreator } from './types';

function generateId(): string {
  return crypto.randomUUID();
}

function toSnapshot(obj: Record<string, unknown> | undefined | null): Record<string, unknown> | undefined {
  if (!obj) return undefined;
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

export const createEntitySlice: SliceCreator<EntitySlice> = (set, get) => ({
  classes: [],
  instances: [],
  properties: [],
  relationTypes: [],
  edges: [],
  axioms: [],
  instanceValues: [],

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

  deleteNodeById: (id, type) =>
    set((state) => {
      if (type === 'class') {
        const cls = state.classes.find((c) => c.id === id);
        if (!cls) return state;

        const deletedInstances = state.instances.filter((i) => i.classId === id);
        const instanceIds = deletedInstances.map((i) => i.id);
        const affectedNodeIds = new Set([id, ...instanceIds]);
        const deletedProperties = state.properties.filter((p) => p.classId === id);
        const deletedEdges = state.edges.filter((e) => affectedNodeIds.has(e.sourceId) || affectedNodeIds.has(e.targetId));
        const deletedAxioms = state.axioms.filter((a) => a.classIds.includes(id));

        const cascadeChanges: Change[] = [
          createChange('DEL', 'classes', id, cls.name,
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
            .filter((c) => c.id !== id)
            .map((c) => c.parentId === id ? { ...c, parentId: null } : c),
          instances: state.instances.filter((i) => i.classId !== id),
          properties: state.properties.filter((p) => p.classId !== id),
          edges: state.edges.filter((e) => !affectedNodeIds.has(e.sourceId) && !affectedNodeIds.has(e.targetId)),
          axioms: state.axioms.filter((a) => !a.classIds.includes(id)),
          instanceValues: state.instanceValues.filter((iv) => !instanceIds.includes(iv.instanceId)),
          selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
          selectedNodeType: state.selectedNodeId === id ? null : state.selectedNodeType,
          pendingChanges: [...state.pendingChanges, ...cascadeChanges],
        };
      }

      if (type === 'instance') {
        const inst = state.instances.find((i) => i.id === id);
        if (!inst) return state;

        const deletedEdges = state.edges.filter((e) => e.sourceId === id || e.targetId === id);
        const instanceCascadeChanges: Change[] = [
          createChange('DEL', 'instances', id, inst.name,
            inst as unknown as Record<string, unknown>),
          ...deletedEdges.map((e) => createChange('DEL', 'edges', e.id, state.relationTypes.find((r) => r.id === e.relationTypeId)?.name ?? 'relation',
            { ...e, relationTypeName: state.relationTypes.find((r) => r.id === e.relationTypeId)?.name } as unknown as Record<string, unknown>)),
        ];

        return {
          instances: state.instances.filter((i) => i.id !== id),
          edges: state.edges.filter((e) => e.sourceId !== id && e.targetId !== id),
          instanceValues: state.instanceValues.filter((iv) => iv.instanceId !== id),
          selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
          selectedNodeType: state.selectedNodeId === id ? null : state.selectedNodeType,
          pendingChanges: [...state.pendingChanges, ...instanceCascadeChanges],
        };
      }

      return state;
    }),

  deleteSelectedNode: () => {
    const { selectedNodeId, selectedNodeType } = get();
    if (!selectedNodeId || !selectedNodeType) return;
    get().deleteNodeById(selectedNodeId, selectedNodeType);
  },

  clearOntology: () =>
    set((state) => {
      const changes: Change[] = [
        ...state.edges.map((e) => createChange('DEL', 'edges', e.id,
          state.relationTypes.find((r) => r.id === e.relationTypeId)?.name ?? 'relation',
          { ...e, relationTypeName: state.relationTypes.find((r) => r.id === e.relationTypeId)?.name } as unknown as Record<string, unknown>)),
        ...state.axioms.map((a) => createChange('DEL', 'axioms', a.id, a.description,
          a as unknown as Record<string, unknown>)),
        ...state.instanceValues.map((iv) => createChange('DEL', 'instance_values', iv.id, iv.value,
          iv as unknown as Record<string, unknown>)),
        ...state.properties.map((p) => createChange('DEL', 'properties', p.id, p.name,
          p as unknown as Record<string, unknown>)),
        ...state.instances.map((i) => createChange('DEL', 'instances', i.id, i.name,
          i as unknown as Record<string, unknown>)),
        ...state.classes.map((c) => createChange('DEL', 'classes', c.id, c.name,
          c as unknown as Record<string, unknown>)),
        ...state.relationTypes.map((rt) => createChange('DEL', 'relation_types', rt.id, rt.name,
          rt as unknown as Record<string, unknown>)),
      ];

      return {
        classes: [],
        instances: [],
        properties: [],
        edges: [],
        axioms: [],
        instanceValues: [],
        relationTypes: [],
        selectedNodeId: null,
        selectedNodeType: null,
        pendingChanges: [...state.pendingChanges, ...changes],
      };
    }),

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

  loadOntology: (data) => set({ ...data, pendingChanges: [], selectedNodeId: null, selectedNodeType: null }),
});
