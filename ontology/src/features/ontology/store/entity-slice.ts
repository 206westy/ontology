'use client';

import type {
  OntologyClass,
  OntologyInstance,
  OntologyProperty,
  RelationType,
  OntologyEdge,
  InstanceValue,
  Change,
  ChangeOperation,
} from '../lib/types';
import { DEFAULT_PARTITION_ID } from '../lib/types';
import type { EntitySlice, SliceCreator } from './types';
import { readWorkspaceSelection } from './workspace-persistence';
import { uuid } from '../lib/uuid';
import { stableEntityId, stableEdgeId } from '../lib/identity';
import { planAssistantActions } from '../lib/plan-actions';

// 노드(class/instance)의 소속 구획 id 를 해석. instance 는 소속 class 의 구획을 상속.
function partitionOfNode(
  state: { classes: OntologyClass[]; instances: OntologyInstance[] },
  nodeId: string,
): string | undefined {
  const cls = state.classes.find((c) => c.id === nodeId);
  if (cls) return cls.partitionId;
  const inst = state.instances.find((i) => i.id === nodeId);
  if (inst) return state.classes.find((c) => c.id === inst.classId)?.partitionId;
  return undefined;
}

function generateId(): string {
  return uuid();
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
  instanceValues: [],
  partitions: [],

  addClass: (data) => {
    const id = data.id ?? generateId();
    // 소속 구획: 명시값 > 현재 선택 구획 > 기본 구획
    const partitionId = data.partitionId ?? get().currentPartitionId ?? DEFAULT_PARTITION_ID;
    const newClass: OntologyClass = {
      id,
      parentId: data.parentId ?? null,
      partitionId,
      name: data.name,
      description: data.description ?? '',
      color: data.color ?? '#7c3aed',
      positionX: data.positionX ?? 0,
      positionY: data.positionY ?? 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceType: data.sourceType ?? null,
      confidence: data.confidence ?? null,
      evidence: data.evidence ?? null,
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
      description: data.description ?? '',
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

        const cascadeChanges: Change[] = [
          createChange('DEL', 'classes', id, cls.name,
            cls as unknown as Record<string, unknown>),
          ...deletedInstances.map((i) => createChange('DEL', 'instances', i.id, i.name,
            i as unknown as Record<string, unknown>)),
          ...deletedProperties.map((p) => createChange('DEL', 'properties', p.id, p.name,
            p as unknown as Record<string, unknown>)),
          ...deletedEdges.map((e) => createChange('DEL', 'edges', e.id, state.relationTypes.find((r) => r.id === e.relationTypeId)?.name ?? 'relation',
            { ...e, relationTypeName: state.relationTypes.find((r) => r.id === e.relationTypeId)?.name } as unknown as Record<string, unknown>)),
        ];

        return {
          classes: state.classes
            .filter((c) => c.id !== id)
            .map((c) => c.parentId === id ? { ...c, parentId: null } : c),
          instances: state.instances.filter((i) => i.classId !== id),
          properties: state.properties.filter((p) => p.classId !== id),
          edges: state.edges.filter((e) => !affectedNodeIds.has(e.sourceId) && !affectedNodeIds.has(e.targetId)),
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
      // PRD-L M2: 레이어 미지정 시 'semantic'(지식) 기본값.
      layer: data.layer ?? 'semantic',
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
    // PRD-B B-1: source/target 구획이 다르면 bridge
    const st = get();
    const srcP = partitionOfNode(st, data.sourceId);
    const tgtP = partitionOfNode(st, data.targetId);
    const isBridge = data.isBridge ?? (!!srcP && !!tgtP && srcP !== tgtP);
    const newEdge: OntologyEdge = {
      id,
      relationTypeId: data.relationTypeId,
      sourceId: data.sourceId,
      targetId: data.targetId,
      sourceKind: data.sourceKind ?? 'class',
      targetKind: data.targetKind ?? 'class',
      isBridge,
      createdAt: new Date().toISOString(),
      sourceType: data.sourceType ?? null,
      confidence: data.confidence ?? null,
      evidence: data.evidence ?? null,
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

  // ── Compound, single-undo actions (P0-1 / P0-2) ──────────────
  // Each runs as ONE set() so zundo records a single checkpoint and
  // pendingChanges is appended as one group (Ctrl+Z reverts the whole batch).

  previewAssistantActions: (actions) => {
    const state = get();
    return planAssistantActions(
      {
        classes: state.classes.map((c) => ({ id: c.id, name: c.name })),
        instances: state.instances.map((i) => ({ id: i.id, name: i.name, classId: i.classId })),
        properties: state.properties.map((p) => ({ name: p.name, classId: p.classId })),
        relationTypes: state.relationTypes.map((r) => ({ id: r.id, name: r.name })),
        edges: state.edges.map((e) => ({
          relationTypeId: e.relationTypeId,
          sourceId: e.sourceId,
          targetId: e.targetId,
        })),
      },
      actions,
    );
  },

  applyAssistantActions: (actions) => {
    const state = get();
    // Working copies — later actions can reference entities created by earlier ones.
    const classes = [...state.classes];
    const instances = [...state.instances];
    const properties = [...state.properties];
    const relationTypes = [...state.relationTypes];
    const edges = [...state.edges];
    const changes: Change[] = [];
    const applied: string[] = [];
    const skipped: { label: string; reason: string }[] = [];

    const norm = (s: string) => s.trim().toLowerCase();
    const findClass = (name: string) => classes.find((c) => norm(c.name) === norm(name));
    const findInstance = (name: string) => instances.find((i) => norm(i.name) === norm(name));
    const findRelType = (name: string) => relationTypes.find((r) => norm(r.name) === norm(name));
    const resolveNode = (name: string): { id: string; kind: 'class' | 'instance' } | null => {
      const c = findClass(name);
      if (c) return { id: c.id, kind: 'class' };
      const i = findInstance(name);
      if (i) return { id: i.id, kind: 'instance' };
      return null;
    };

    for (const action of actions) {
      const { label } = action;
      const skip = (reason: string) => skipped.push({ label, reason });

      if (action.op === 'add_class') {
        const { name, parentName, description, color } = action.payload;
        if (findClass(name)) { skip(`이미 존재하는 클래스입니다: ${name}`); continue; }
        let parentId: string | null = null;
        if (parentName) {
          const parent = findClass(parentName);
          if (!parent) { skip(`상위 클래스를 찾을 수 없습니다: ${parentName}`); continue; }
          parentId = parent.id;
        }
        const classPartitionId = get().currentPartitionId ?? DEFAULT_PARTITION_ID;
        const newClass: OntologyClass = {
          // P1-1: 재유입 시 같은 노드로 수렴하도록 content-hash 안정 id 사용.
          id: stableEntityId(name, 'class', classPartitionId), parentId,
          partitionId: classPartitionId,
          name,
          description: description ?? '', color: color ?? '#7c3aed',
          positionX: 0, positionY: 0,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        classes.push(newClass);
        changes.push(createChange('ADD', 'classes', newClass.id, newClass.name, undefined, newClass as unknown as Record<string, unknown>));
        applied.push(newClass.id);
        continue;
      }

      if (action.op === 'add_property') {
        const { className, name, dataType, enumValues, isRequired } = action.payload;
        const cls = findClass(className);
        if (!cls) { skip(`클래스를 찾을 수 없습니다: ${className}`); continue; }
        if (properties.some((p) => p.classId === cls.id && norm(p.name) === norm(name))) {
          skip(`이미 존재하는 프로퍼티입니다: ${className}.${name}`); continue;
        }
        if (dataType === 'enum' && (!enumValues || enumValues.length === 0)) {
          skip(`enum 타입은 enumValues가 필요합니다: ${name}`); continue;
        }
        const newProp: OntologyProperty = {
          id: generateId(), classId: cls.id, name, dataType,
          isRequired: isRequired ?? false,
          enumValues: enumValues ?? null, constraintRule: null, sortOrder: 0,
        };
        properties.push(newProp);
        changes.push(createChange('ADD', 'properties', newProp.id, newProp.name, undefined, newProp as unknown as Record<string, unknown>));
        applied.push(cls.id);
        continue;
      }

      if (action.op === 'add_instance') {
        const { className, name } = action.payload;
        const cls = findClass(className);
        if (!cls) { skip(`클래스를 찾을 수 없습니다: ${className}`); continue; }
        if (instances.some((i) => i.classId === cls.id && norm(i.name) === norm(name))) {
          skip(`이미 존재하는 인스턴스입니다: ${name}`); continue;
        }
        const newInstance: OntologyInstance = {
          // P1-1: instance 는 소속 class 의 구획을 상속해 안정 id 산출.
          id: stableEntityId(name, 'instance', cls.partitionId ?? DEFAULT_PARTITION_ID),
          classId: cls.id, name, description: '',
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        instances.push(newInstance);
        changes.push(createChange('ADD', 'instances', newInstance.id, newInstance.name, undefined, newInstance as unknown as Record<string, unknown>));
        applied.push(newInstance.id);
        continue;
      }

      if (action.op === 'add_relation_type') {
        const { name, sourceClassName, targetClassName } = action.payload;
        if (findRelType(name)) { skip(`이미 존재하는 관계 타입입니다: ${name}`); continue; }
        let sourceClassId = '';
        let targetClassId = '';
        if (sourceClassName) {
          const c = findClass(sourceClassName);
          if (!c) { skip(`출발 클래스를 찾을 수 없습니다: ${sourceClassName}`); continue; }
          sourceClassId = c.id;
        }
        if (targetClassName) {
          const c = findClass(targetClassName);
          if (!c) { skip(`도착 클래스를 찾을 수 없습니다: ${targetClassName}`); continue; }
          targetClassId = c.id;
        }
        const newType: RelationType = {
          id: generateId(), name, description: '', layer: 'semantic',
          sourceClassId, targetClassId,
          createdAt: new Date().toISOString(),
        };
        relationTypes.push(newType);
        changes.push(createChange('ADD', 'relation_types', newType.id, newType.name, undefined, newType as unknown as Record<string, unknown>));
        continue;
      }

      if (action.op === 'add_edge') {
        const { relationTypeName, sourceName, targetName } = action.payload;
        const rt = findRelType(relationTypeName);
        if (!rt) { skip(`관계 타입을 찾을 수 없습니다: ${relationTypeName}`); continue; }
        const s = resolveNode(sourceName);
        if (!s) { skip(`출발 노드를 찾을 수 없습니다: ${sourceName}`); continue; }
        const t = resolveNode(targetName);
        if (!t) { skip(`도착 노드를 찾을 수 없습니다: ${targetName}`); continue; }
        if (s.id === t.id) { skip(`출발과 도착이 같습니다: ${sourceName}`); continue; }
        if (edges.some((e) => e.relationTypeId === rt.id && e.sourceId === s.id && e.targetId === t.id)) {
          skip(`이미 존재하는 관계입니다: ${sourceName} → ${targetName}`); continue;
        }
        const newEdge: OntologyEdge = {
          // P1-1: 엣지도 안정 id — 안 그러면 재유입마다 새 random id 로 같은 노드
          // 사이 관계가 중복 생성된다(cypher-builder edge MERGE 가 {id} 로 묶음).
          id: stableEdgeId(s.id, t.id, rt.name),
          relationTypeId: rt.id,
          sourceId: s.id, targetId: t.id, sourceKind: s.kind, targetKind: t.kind,
          createdAt: new Date().toISOString(),
        };
        edges.push(newEdge);
        changes.push(createChange('ADD', 'edges', newEdge.id, rt.name, undefined,
          { ...newEdge, relationTypeName: rt.name } as unknown as Record<string, unknown>));
        applied.push(s.id, t.id);
        continue;
      }

      if (action.op === 'update_class') {
        const { className, description, color } = action.payload;
        const idx = classes.findIndex((c) => norm(c.name) === norm(className));
        if (idx === -1) { skip(`클래스를 찾을 수 없습니다: ${className}`); continue; }
        const existing = classes[idx];
        const merged: OntologyClass = {
          ...existing,
          ...(description !== undefined ? { description } : {}),
          ...(color !== undefined ? { color } : {}),
          updatedAt: new Date().toISOString(),
        };
        classes[idx] = merged;
        changes.push(createChange('MOD', 'classes', merged.id, merged.name,
          existing as unknown as Record<string, unknown>,
          merged as unknown as Record<string, unknown>));
        applied.push(merged.id);
        continue;
      }
    }

    if (changes.length > 0) {
      set({
        classes, instances, properties, relationTypes, edges,
        pendingChanges: [...state.pendingChanges, ...changes],
      });
    }
    return { applied, skipped };
  },

  mergeEntities: (survivorId, mergedId, kind) => {
    const state = get();
    if (survivorId === mergedId) return { ok: false, reason: '같은 노드는 병합할 수 없습니다.' };

    const relName = (relationTypeId: string) =>
      state.relationTypes.find((r) => r.id === relationTypeId)?.name ?? 'relation';

    if (kind === 'instance') {
      const survivor = state.instances.find((i) => i.id === survivorId);
      const merged = state.instances.find((i) => i.id === mergedId);
      if (!survivor || !merged) return { ok: false, reason: '인스턴스를 찾을 수 없습니다.' };

      const changes: Change[] = [];
      let edges = [...state.edges];

      // Reconnect merged's edges to survivor (drop self-loops / duplicates)
      for (const e of state.edges) {
        if (e.sourceId !== mergedId && e.targetId !== mergedId) continue;
        const newSourceId = e.sourceId === mergedId ? survivorId : e.sourceId;
        const newTargetId = e.targetId === mergedId ? survivorId : e.targetId;
        // remove the old edge
        edges = edges.filter((x) => x.id !== e.id);
        changes.push(createChange('DEL', 'edges', e.id, relName(e.relationTypeId),
          { ...e, relationTypeName: relName(e.relationTypeId) } as unknown as Record<string, unknown>));
        const isSelf = newSourceId === newTargetId;
        const isDup = edges.some((x) => x.relationTypeId === e.relationTypeId && x.sourceId === newSourceId && x.targetId === newTargetId);
        if (isSelf || isDup) continue;
        const reEdge: OntologyEdge = {
          ...e, id: generateId(), sourceId: newSourceId, targetId: newTargetId,
          sourceKind: e.sourceId === mergedId ? 'instance' : e.sourceKind,
          targetKind: e.targetId === mergedId ? 'instance' : e.targetKind,
          createdAt: new Date().toISOString(),
        };
        edges.push(reEdge);
        changes.push(createChange('ADD', 'edges', reEdge.id, relName(reEdge.relationTypeId), undefined,
          { ...reEdge, relationTypeName: relName(reEdge.relationTypeId) } as unknown as Record<string, unknown>));
      }

      // Migrate instance values (fill gaps only)
      let instanceValues = [...state.instanceValues];
      for (const iv of state.instanceValues.filter((v) => v.instanceId === mergedId)) {
        const survivorHas = instanceValues.some((v) => v.instanceId === survivorId && v.propertyId === iv.propertyId);
        if (survivorHas) {
          instanceValues = instanceValues.filter((v) => v.id !== iv.id);
          changes.push(createChange('DEL', 'instance_values', iv.id, iv.value, iv as unknown as Record<string, unknown>));
        } else {
          instanceValues = instanceValues.map((v) => v.id === iv.id ? { ...v, instanceId: survivorId } : v);
          changes.push(createChange('MOD', 'instance_values', iv.id, iv.value,
            iv as unknown as Record<string, unknown>,
            { ...iv, instanceId: survivorId } as unknown as Record<string, unknown>));
        }
      }

      // Delete merged instance
      const instances = state.instances.filter((i) => i.id !== mergedId);
      changes.push(createChange('DEL', 'instances', mergedId, merged.name, merged as unknown as Record<string, unknown>));

      set({
        instances, edges, instanceValues,
        selectedNodeId: state.selectedNodeId === mergedId ? survivorId : state.selectedNodeId,
        pendingChanges: [...state.pendingChanges, ...changes],
      });
      return { ok: true };
    }

    // kind === 'class'
    const survivor = state.classes.find((c) => c.id === survivorId);
    const merged = state.classes.find((c) => c.id === mergedId);
    if (!survivor || !merged) return { ok: false, reason: '클래스를 찾을 수 없습니다.' };

    // Build resulting parent map and detect is-a cycle before committing.
    const parentMap = new Map<string, string | null>();
    for (const c of state.classes) {
      if (c.id === mergedId) continue;
      let parentId = c.parentId;
      if (c.id === survivorId && survivor.parentId === mergedId) parentId = merged.parentId; // avoid self-loop
      else if (parentId === mergedId) parentId = survivorId; // reparent merged's children to survivor
      parentMap.set(c.id, parentId);
    }
    const hasCycle = (() => {
      for (const start of parentMap.keys()) {
        const seen = new Set<string>();
        let cur: string | null | undefined = start;
        while (cur) {
          if (seen.has(cur)) return true;
          seen.add(cur);
          cur = parentMap.get(cur) ?? null;
        }
      }
      return false;
    })();
    if (hasCycle) return { ok: false, reason: '병합 시 is-a 순환이 발생하여 병합할 수 없습니다.' };

    const changes: Change[] = [];

    // Reparent children of merged (and apply the self-loop guard) → MOD classes
    let classes = state.classes.map((c) => {
      const newParent = parentMap.get(c.id);
      if (c.id !== mergedId && newParent !== undefined && newParent !== c.parentId) {
        const updated = { ...c, parentId: newParent, updatedAt: new Date().toISOString() };
        changes.push(createChange('MOD', 'classes', c.id, c.name,
          c as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>));
        return updated;
      }
      return c;
    });

    // Migrate properties (skip names that survivor already has → drop them)
    const survivorPropNames = new Set(state.properties.filter((p) => p.classId === survivorId).map((p) => p.name.toLowerCase()));
    let properties = [...state.properties];
    for (const p of state.properties.filter((p) => p.classId === mergedId)) {
      if (survivorPropNames.has(p.name.toLowerCase())) {
        properties = properties.filter((x) => x.id !== p.id);
        changes.push(createChange('DEL', 'properties', p.id, p.name, p as unknown as Record<string, unknown>));
      } else {
        properties = properties.map((x) => x.id === p.id ? { ...x, classId: survivorId } : x);
        changes.push(createChange('MOD', 'properties', p.id, p.name,
          p as unknown as Record<string, unknown>,
          { ...p, classId: survivorId } as unknown as Record<string, unknown>));
        survivorPropNames.add(p.name.toLowerCase());
      }
    }

    // Migrate instances (drop name collisions within survivor class)
    const survivorInstNames = new Set(state.instances.filter((i) => i.classId === survivorId).map((i) => i.name.toLowerCase()));
    let instances = [...state.instances];
    let instanceValues = [...state.instanceValues];
    const droppedInstanceIds = new Set<string>();
    for (const i of state.instances.filter((i) => i.classId === mergedId)) {
      if (survivorInstNames.has(i.name.toLowerCase())) {
        instances = instances.filter((x) => x.id !== i.id);
        droppedInstanceIds.add(i.id);
        changes.push(createChange('DEL', 'instances', i.id, i.name, i as unknown as Record<string, unknown>));
      } else {
        instances = instances.map((x) => x.id === i.id ? { ...x, classId: survivorId } : x);
        changes.push(createChange('MOD', 'instances', i.id, i.name,
          i as unknown as Record<string, unknown>,
          { ...i, classId: survivorId } as unknown as Record<string, unknown>));
        survivorInstNames.add(i.name.toLowerCase());
      }
    }

    // Reconnect class-level edges of merged to survivor; drop edges of dropped instances.
    let edges = [...state.edges];
    for (const e of state.edges) {
      const touchesMergedClass = e.sourceId === mergedId || e.targetId === mergedId;
      const touchesDroppedInst = droppedInstanceIds.has(e.sourceId) || droppedInstanceIds.has(e.targetId);
      if (!touchesMergedClass && !touchesDroppedInst) continue;
      edges = edges.filter((x) => x.id !== e.id);
      changes.push(createChange('DEL', 'edges', e.id, relName(e.relationTypeId),
        { ...e, relationTypeName: relName(e.relationTypeId) } as unknown as Record<string, unknown>));
      if (touchesDroppedInst) continue; // dropped instance edges are simply removed
      const newSourceId = e.sourceId === mergedId ? survivorId : e.sourceId;
      const newTargetId = e.targetId === mergedId ? survivorId : e.targetId;
      const isSelf = newSourceId === newTargetId;
      const isDup = edges.some((x) => x.relationTypeId === e.relationTypeId && x.sourceId === newSourceId && x.targetId === newTargetId);
      if (isSelf || isDup) continue;
      const reEdge: OntologyEdge = {
        ...e, id: generateId(), sourceId: newSourceId, targetId: newTargetId,
        createdAt: new Date().toISOString(),
      };
      edges.push(reEdge);
      changes.push(createChange('ADD', 'edges', reEdge.id, relName(reEdge.relationTypeId), undefined,
        { ...reEdge, relationTypeName: relName(reEdge.relationTypeId) } as unknown as Record<string, unknown>));
    }

    // Drop instance values of dropped instances
    if (droppedInstanceIds.size > 0) {
      for (const iv of state.instanceValues.filter((v) => droppedInstanceIds.has(v.instanceId))) {
        instanceValues = instanceValues.filter((v) => v.id !== iv.id);
        changes.push(createChange('DEL', 'instance_values', iv.id, iv.value, iv as unknown as Record<string, unknown>));
      }
    }

    // Finally delete merged class
    classes = classes.filter((c) => c.id !== mergedId);
    changes.push(createChange('DEL', 'classes', mergedId, merged.name, merged as unknown as Record<string, unknown>));

    set({
      classes, instances, properties, edges, instanceValues,
      selectedNodeId: state.selectedNodeId === mergedId ? survivorId : state.selectedNodeId,
      selectedNodeType: state.selectedNodeId === mergedId ? 'class' : state.selectedNodeType,
      pendingChanges: [...state.pendingChanges, ...changes],
    });
    return { ok: true };
  },

  loadOntology: (data) => {
    // 워크스페이스(구획) 선택 복원 — 마지막으로 보던 구획이 아직 존재하면 그대로,
    // 삭제됐으면 기본 구획으로 폴백. persist 없이 매 로드마다 기본으로 리셋되던 문제 해소.
    const persisted = readWorkspaceSelection();
    const partitionIds = new Set((data.partitions ?? []).map((p) => p.id));
    let currentPartitionId = DEFAULT_PARTITION_ID;
    let showAllPartitions = false;
    if (persisted?.showAll) {
      showAllPartitions = true;
    } else if (persisted?.partitionId && partitionIds.has(persisted.partitionId)) {
      currentPartitionId = persisted.partitionId;
    }

    set({
      ...data,
      currentPartitionId,
      showAllPartitions,
      pendingChanges: [],
      selectedNodeId: null,
      selectedNodeType: null,
      // M8: 온톨로지 전환 시 이전 필터/포커스/하이라이트가 남아 혼란을 주지 않도록
      // 뷰 상태를 기본값으로 초기화한다(데이터만 바뀌고 필터가 잔존하던 문제).
      showClasses: true,
      showInstances: true,
      colorFilter: [],
      minDegree: 0,
      focusModeNodeId: null,
      focusDepth: 1,
      focusNodeId: null,
      highlightNodeIds: [],
    });
  },

  // PRD-Perf M3-3: 인스턴스 지연 로드 2단계 — 서버 인스턴스/값만 채워 넣는다.
  // loadOntology 와 달리 pendingChanges·선택·필터를 리셋하지 않으며,
  // 로드 창 사이에 사용자가 방금 추가한 로컬 전용 항목은 보존(유니온)한다.
  mergeInstancesData: ({ instances, instanceValues }) =>
    set((state) => {
      const serverInstanceIds = new Set(instances.map((i) => i.id));
      const localOnlyInstances = state.instances.filter((i) => !serverInstanceIds.has(i.id));
      const serverValueIds = new Set(instanceValues.map((v) => v.id));
      const localOnlyValues = state.instanceValues.filter((v) => !serverValueIds.has(v.id));
      return {
        instances: [...instances, ...localOnlyInstances],
        instanceValues: [...instanceValues, ...localOnlyValues],
      };
    }),
});
