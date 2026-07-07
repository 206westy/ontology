import { describe, it, expect, beforeEach } from 'vitest';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';

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
    toolMode: 'select' as const,
    zoomAction: null,
  });
  // Clear temporal (undo) history so tests start fresh
  useOntologyStore.temporal.getState().clear();
}

describe('useOntologyStore — Iteration 2', () => {
  beforeEach(() => {
    resetStore();
  });

  // A-4: Toolbar toolMode and zoomAction
  describe('toolMode and zoomAction', () => {
    it('should default toolMode to select', () => {
      expect(useOntologyStore.getState().toolMode).toBe('select');
    });

    it('should change toolMode to pan', () => {
      useOntologyStore.getState().setToolMode('pan');
      expect(useOntologyStore.getState().toolMode).toBe('pan');
    });

    it('should change toolMode back to select', () => {
      useOntologyStore.getState().setToolMode('pan');
      useOntologyStore.getState().setToolMode('select');
      expect(useOntologyStore.getState().toolMode).toBe('select');
    });

    it('should set zoomAction to in', () => {
      useOntologyStore.getState().triggerZoom('in');
      expect(useOntologyStore.getState().zoomAction).toBe('in');
    });

    it('should set zoomAction to out', () => {
      useOntologyStore.getState().triggerZoom('out');
      expect(useOntologyStore.getState().zoomAction).toBe('out');
    });

    it('should set zoomAction to fit', () => {
      useOntologyStore.getState().triggerZoom('fit');
      expect(useOntologyStore.getState().zoomAction).toBe('fit');
    });

    it('should clear zoomAction', () => {
      useOntologyStore.getState().triggerZoom('in');
      useOntologyStore.getState().clearZoomAction();
      expect(useOntologyStore.getState().zoomAction).toBeNull();
    });
  });

  // B-1: zundo partialize excludes UI state
  describe('partialize excludes UI state (B-1)', () => {
    it('should preserve toolMode after undo of a data change', () => {
      // 1. Create a class (data change — tracked by partialize)
      useOntologyStore.getState().addClass({ name: 'A' });
      // 2. Change toolMode (UI-only — NOT tracked by partialize)
      useOntologyStore.getState().setToolMode('pan');
      // 3. Create another class so we have something to undo
      useOntologyStore.getState().addClass({ name: 'B' });

      // Undo last data change (remove class B)
      useOntologyStore.temporal.getState().undo();

      // toolMode should be preserved (not reverted) since it's excluded from partialize
      expect(useOntologyStore.getState().toolMode).toBe('pan');
      // Class B should be undone
      expect(useOntologyStore.getState().classes).toHaveLength(1);
      expect(useOntologyStore.getState().classes[0].name).toBe('A');
    });

    it('should preserve zoomAction after undo of a data change', () => {
      useOntologyStore.getState().addClass({ name: 'X' });
      useOntologyStore.getState().triggerZoom('fit');
      useOntologyStore.getState().addClass({ name: 'Y' });

      useOntologyStore.temporal.getState().undo();

      // zoomAction should remain since it's excluded from partialize
      expect(useOntologyStore.getState().zoomAction).toBe('fit');
      expect(useOntologyStore.getState().classes).toHaveLength(1);
    });
  });

  // A-5: CommitBar opCounts — ADD/MOD/DEL counts
  describe('pendingChanges operation counts (A-5)', () => {
    it('should track ADD operations', () => {
      useOntologyStore.getState().addClass({ name: 'A' });
      useOntologyStore.getState().addClass({ name: 'B' });

      const changes = useOntologyStore.getState().pendingChanges;
      const addCount = changes.filter((c) => c.operation === 'ADD').length;
      expect(addCount).toBe(2);
    });

    it('should track MOD operations', () => {
      const id = useOntologyStore.getState().addClass({ name: 'Old' });
      useOntologyStore.getState().updateClass(id, { name: 'New' });

      const changes = useOntologyStore.getState().pendingChanges;
      const modCount = changes.filter((c) => c.operation === 'MOD').length;
      expect(modCount).toBe(1);
    });

    it('should track DEL operations', () => {
      const id = useOntologyStore.getState().addClass({ name: 'ToRemove' });
      useOntologyStore.getState().removeClass(id);

      const changes = useOntologyStore.getState().pendingChanges;
      const delCount = changes.filter((c) => c.operation === 'DEL').length;
      expect(delCount).toBe(1);
    });

    it('should track mixed ADD/MOD/DEL', () => {
      const id1 = useOntologyStore.getState().addClass({ name: 'Keep' });
      const id2 = useOntologyStore.getState().addClass({ name: 'Modify' });
      const id3 = useOntologyStore.getState().addClass({ name: 'Remove' });
      useOntologyStore.getState().updateClass(id2, { name: 'Modified' });
      useOntologyStore.getState().removeClass(id3);

      const changes = useOntologyStore.getState().pendingChanges;
      expect(changes.filter((c) => c.operation === 'ADD').length).toBe(3);
      expect(changes.filter((c) => c.operation === 'MOD').length).toBe(1);
      expect(changes.filter((c) => c.operation === 'DEL').length).toBe(1);
    });
  });

  // B-7: parentName is not set in handleConfirm (mockParse always sets parentName: null)
  describe('parentName handling (B-7)', () => {
    it('mockParse produces parentName: null', () => {
      // Direct test of the store — addClass without parentId
      const id = useOntologyStore.getState().addClass({
        name: 'DryAsher',
        // No parentId passed — this is what NewNodePopover does when parentName is ignored
      });

      const cls = useOntologyStore.getState().classes[0];
      expect(cls.parentId).toBeNull();
    });
  });
});
