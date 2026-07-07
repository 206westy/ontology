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
