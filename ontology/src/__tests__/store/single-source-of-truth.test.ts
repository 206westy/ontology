import { describe, it, expect, beforeEach } from 'vitest';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';

// S1 — "단일 진실 모델" invariant lock.
//
// The NewNodePopover confirm paths (handleQuickAdd / handleCsvConfirm /
// handleConfirm) mutate the graph ONLY through these store actions. This test
// pins the two properties that make the model a single source of truth that AI
// inputs propose diffs against, rather than a fresh graph each time:
//   1. every entity-creating action records exactly one tracked pendingChange
//   2. those changes are reversible via the zundo temporal store (Undo-compatible)
//
// If a future change (S2/S4) bypasses store actions or stops recording
// pendingChanges, these assertions break — which is the point.

function resetStore() {
  useOntologyStore.setState({
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
    highlightNodeIds: [],
  });
  // Drop the reset itself from undo history so undo() lands on this empty state.
  useOntologyStore.temporal.getState().clear();
}

describe('단일 진실 모델 — pendingChanges invariant', () => {
  beforeEach(resetStore);

  it('records exactly one ADD pendingChange per entity-creating action', () => {
    const s = useOntologyStore.getState();
    const idA = s.addClass({ name: 'A' });
    const idB = s.addClass({ name: 'B' });
    const propId = s.addProperty({ classId: idA, name: 'temp', dataType: 'string' });
    const instId = s.addInstance({ classId: idA, name: 'a1' });
    s.setInstanceValue(instId, propId, '42');
    const rtId = s.addRelationType({ name: 'relates_to' });
    s.addEdge({ relationTypeId: rtId, sourceId: idA, targetId: idB });

    const changes = useOntologyStore.getState().pendingChanges;
    // class, class, property, instance, instance_value, relation_type, edge
    expect(changes).toHaveLength(7);
    expect(changes.every((c) => c.operation === 'ADD')).toBe(true);

    const tables = changes.map((c) => c.targetTable);
    expect(tables).toEqual([
      'classes',
      'classes',
      'properties',
      'instances',
      'instance_values',
      'relation_types',
      'edges',
    ]);
  });

  it('is fully reversible via the temporal store (import = one undoable diff sequence)', () => {
    const s = useOntologyStore.getState();
    const idA = s.addClass({ name: 'A' });
    const idB = s.addClass({ name: 'B' });
    const rtId = s.addRelationType({ name: 'relates_to' });
    s.addEdge({ relationTypeId: rtId, sourceId: idA, targetId: idB });

    expect(useOntologyStore.getState().classes).toHaveLength(2);
    expect(useOntologyStore.getState().edges).toHaveLength(1);
    expect(useOntologyStore.getState().pendingChanges).toHaveLength(4);

    // Undo every step → back to the empty source-of-truth.
    useOntologyStore.temporal.getState().undo(4);

    const after = useOntologyStore.getState();
    expect(after.classes).toHaveLength(0);
    expect(after.edges).toHaveLength(0);
    expect(after.relationTypes).toHaveLength(0);
    expect(after.pendingChanges).toHaveLength(0);
  });

  it('does not mutate the graph outside store actions (no untracked writes)', () => {
    const s = useOntologyStore.getState();
    s.addClass({ name: 'Solo' });
    // Exactly one node, exactly one tracked change — no hidden side writes.
    const state = useOntologyStore.getState();
    expect(state.classes).toHaveLength(1);
    expect(state.pendingChanges).toHaveLength(1);
    expect(state.pendingChanges[0].targetName).toBe('Solo');
  });
});
