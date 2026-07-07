import { describe, it, expect, beforeEach } from 'vitest';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';
import type { OntologyAction } from '@/features/ontology/lib/schemas';

function resetStore() {
  useOntologyStore.setState({
    classes: [],
    instances: [],
    properties: [],
    relationTypes: [],
    edges: [],
    instanceValues: [],
    selectedNodeId: null,
    selectedNodeType: null,
    pendingChanges: [],
    popoverState: null,
    expandedNodes: new Set<string>(),
    focusNodeId: null,
    highlightNodeIds: [],
  });
}

describe('applyAssistantActions (P0-1)', () => {
  beforeEach(resetStore);

  it('adds a class and records exactly one pendingChange', () => {
    const action: OntologyAction = {
      op: 'add_class',
      label: 'Animal 추가',
      payload: { name: 'Animal' },
    };
    const res = useOntologyStore.getState().applyAssistantActions([action]);
    const state = useOntologyStore.getState();

    expect(res.applied).toHaveLength(1);
    expect(res.skipped).toHaveLength(0);
    expect(state.classes).toHaveLength(1);
    expect(state.pendingChanges).toHaveLength(1);
  });

  it('groups a multi-action batch into a single pendingChanges block (one undo step)', () => {
    const actions: OntologyAction[] = [
      { op: 'add_class', label: 'Animal', payload: { name: 'Animal' } },
      { op: 'add_class', label: 'Dog', payload: { name: 'Dog', parentName: 'Animal' } },
      { op: 'add_instance', label: 'Rex', payload: { className: 'Dog', name: 'Rex' } },
    ];
    const res = useOntologyStore.getState().applyAssistantActions(actions);
    const state = useOntologyStore.getState();

    expect(res.applied.length).toBe(3);
    expect(state.classes).toHaveLength(2);
    expect(state.instances).toHaveLength(1);
    // 3 changes appended in one set() call
    expect(state.pendingChanges).toHaveLength(3);
    // Dog should be parented to Animal (resolved within the same batch)
    const dog = state.classes.find((c) => c.name === 'Dog');
    const animal = state.classes.find((c) => c.name === 'Animal');
    expect(dog?.parentId).toBe(animal?.id);
  });

  it('skips an action whose parent cannot be resolved', () => {
    const res = useOntologyStore.getState().applyAssistantActions([
      { op: 'add_class', label: 'Dog', payload: { name: 'Dog', parentName: 'Ghost' } },
    ]);
    expect(res.applied).toHaveLength(0);
    expect(res.skipped).toHaveLength(1);
    expect(useOntologyStore.getState().classes).toHaveLength(0);
    expect(useOntologyStore.getState().pendingChanges).toHaveLength(0);
  });

  it('skips duplicate class names', () => {
    useOntologyStore.getState().addClass({ name: 'Animal' });
    const res = useOntologyStore.getState().applyAssistantActions([
      { op: 'add_class', label: 'dup', payload: { name: 'animal' } },
    ]);
    expect(res.skipped).toHaveLength(1);
    expect(useOntologyStore.getState().classes).toHaveLength(1);
  });

  // PRD-L M3: 단일 add_relation — ① 미존재 시 유형 자동 생성 + 엣지 생성 한 번에.
  it('add_relation auto-creates a relation type and an edge in one action', () => {
    const store = useOntologyStore.getState();
    store.addClass({ name: 'Person' });
    store.addClass({ name: 'Company' });
    const changesBefore = useOntologyStore.getState().pendingChanges.length;
    const res = useOntologyStore.getState().applyAssistantActions([
      { op: 'add_relation', label: 'r1', payload: { relationName: 'worksFor', sourceName: 'Person', targetName: 'Company', layer: 'kinetic' } },
    ]);
    const state = useOntologyStore.getState();

    expect(res.skipped).toHaveLength(0);
    expect(state.relationTypes).toHaveLength(1);
    expect(state.relationTypes[0].name).toBe('worksFor');
    expect(state.relationTypes[0].layer).toBe('kinetic');
    expect(state.edges).toHaveLength(1);
    // 유형 자동 생성 + 엣지 = 이 액션이 추가한 pendingChanges 2건.
    expect(state.pendingChanges.length - changesBefore).toBe(2);
  });

  // ② 이미 존재하는 유형이면 재사용해 중복 생성하지 않는다.
  it('add_relation reuses an existing relation type (name-normalized)', () => {
    const store = useOntologyStore.getState();
    const person = store.addClass({ name: 'Person' });
    const company = store.addClass({ name: 'Company' });
    const other = store.addClass({ name: 'Team' });
    store.addRelationType({ name: 'worksFor' });

    useOntologyStore.getState().applyAssistantActions([
      { op: 'add_relation', label: 'r1', payload: { relationName: 'WORKSFOR', sourceName: 'Person', targetName: 'Company' } },
      { op: 'add_relation', label: 'r2', payload: { relationName: 'worksFor', sourceName: 'Person', targetName: 'Team' } },
    ]);
    const state = useOntologyStore.getState();

    // 재사용 — 유형은 여전히 1개, 엣지는 2개.
    expect(state.relationTypes).toHaveLength(1);
    expect(state.edges).toHaveLength(2);
    expect(state.edges.every((e) => e.relationTypeId === state.relationTypes[0].id)).toBe(true);
    // 양끝 해소 검증.
    const rtId = state.relationTypes[0].id;
    expect(state.edges.some((e) => e.sourceId === person && e.targetId === company && e.relationTypeId === rtId)).toBe(true);
    expect(state.edges.some((e) => e.sourceId === person && e.targetId === other && e.relationTypeId === rtId)).toBe(true);
  });

  // ③ 양끝 노드를 못 찾으면 skip.
  it('add_relation skips when an endpoint cannot be resolved', () => {
    useOntologyStore.getState().addClass({ name: 'Person' });
    const res = useOntologyStore.getState().applyAssistantActions([
      { op: 'add_relation', label: 'r1', payload: { relationName: 'worksFor', sourceName: 'Person', targetName: 'Ghost' } },
    ]);
    const state = useOntologyStore.getState();
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0].reason).toContain('도착 노드를 찾을 수 없습니다');
    expect(state.relationTypes).toHaveLength(0);
    expect(state.edges).toHaveLength(0);
  });
});

describe('mergeEntities (P0-2)', () => {
  beforeEach(resetStore);

  it('merges two classes, reconnecting edges to survivor and deleting merged', () => {
    const store = useOntologyStore.getState();
    const a = store.addClass({ name: 'Car' });
    const b = store.addClass({ name: 'Automobile' });
    const other = store.addClass({ name: 'Wheel' });
    const rt = store.addRelationType({ name: 'hasPart' });
    store.addEdge({ relationTypeId: rt, sourceId: b, targetId: other, sourceKind: 'class', targetKind: 'class' });

    const result = useOntologyStore.getState().mergeEntities(a, b, 'class');
    const state = useOntologyStore.getState();

    expect(result.ok).toBe(true);
    expect(state.classes.find((c) => c.id === b)).toBeUndefined(); // merged removed
    expect(state.classes.find((c) => c.id === a)).toBeDefined(); // survivor kept
    // edge now originates from survivor
    const edge = state.edges.find((e) => e.relationTypeId === rt);
    expect(edge?.sourceId).toBe(a);
  });

  it('reparents a direct parent merge to root (no false cycle)', () => {
    const store = useOntologyStore.getState();
    const parent = store.addClass({ name: 'Parent' });
    const child = store.addClass({ name: 'Child', parentId: parent });
    // Merging the direct parent INTO the child: child should become a root, not loop.
    const result = useOntologyStore.getState().mergeEntities(child, parent, 'class');
    expect(result.ok).toBe(true);
    const survivor = useOntologyStore.getState().classes.find((c) => c.id === child);
    expect(survivor?.parentId).toBeNull();
  });

  it('prevents a merge that would create an is-a cycle (3-level chain)', () => {
    const store = useOntologyStore.getState();
    const a = store.addClass({ name: 'A' }); // root
    const b = store.addClass({ name: 'B', parentId: a });
    const c = store.addClass({ name: 'C', parentId: b });
    // Merge A (ancestor) INTO C (descendant): B reparents to C, C still parents B → cycle.
    const result = useOntologyStore.getState().mergeEntities(c, a, 'class');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('순환');
  });

  it('merges instances and reconnects their edges', () => {
    const store = useOntologyStore.getState();
    const cls = store.addClass({ name: 'Person' });
    const i1 = store.addInstance({ classId: cls, name: 'Bob' });
    const i2 = store.addInstance({ classId: cls, name: 'Bobby' });
    const target = store.addInstance({ classId: cls, name: 'Alice' });
    const rt = store.addRelationType({ name: 'knows' });
    store.addEdge({ relationTypeId: rt, sourceId: i2, targetId: target, sourceKind: 'instance', targetKind: 'instance' });

    const result = useOntologyStore.getState().mergeEntities(i1, i2, 'instance');
    const state = useOntologyStore.getState();

    expect(result.ok).toBe(true);
    expect(state.instances.find((i) => i.id === i2)).toBeUndefined();
    const edge = state.edges.find((e) => e.relationTypeId === rt);
    expect(edge?.sourceId).toBe(i1);
  });
});
