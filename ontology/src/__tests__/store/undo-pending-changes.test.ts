import { describe, it, expect, beforeEach } from 'vitest';
import {
  useOntologyStore,
  clearChangesWithoutHistory,
} from '@/features/ontology/hooks/useOntologyStore';

// H3 regression: a *programmatic* queue clear (autosave / manual commit / push)
// must not become an undoable snapshot. Otherwise a later undo resurrects the
// already-committed changes and they get re-sent. clearChangesWithoutHistory()
// pauses temporal tracking so the clear leaves no undo entry, while ordinary
// user edits still revert their queue items together with the data.
describe('programmatic clear is not resurrected by undo', () => {
  beforeEach(() => {
    useOntologyStore.getState().clearOntology();
    useOntologyStore.getState().clearChanges();
    useOntologyStore.temporal.getState().clear();
  });

  it('keeps pendingChanges empty after an untracked clear + undo', () => {
    useOntologyStore.getState().addClass({ name: 'Person' });
    expect(useOntologyStore.getState().pendingChanges.length).toBeGreaterThan(0);

    // Simulate autosave committing + clearing the queue (must not be undoable).
    clearChangesWithoutHistory();
    expect(useOntologyStore.getState().pendingChanges).toHaveLength(0);

    // Undo rewinds the entity edit, but the cleared queue must not be re-queued.
    useOntologyStore.temporal.getState().undo();
    expect(useOntologyStore.getState().pendingChanges).toHaveLength(0);
  });

  it('still reverts the queue together with data for ordinary user-edit undo', () => {
    useOntologyStore.getState().addClass({ name: 'A' });
    useOntologyStore.getState().addClass({ name: 'B' });
    expect(useOntologyStore.getState().pendingChanges).toHaveLength(2);

    // A normal undo of a user edit reverts both the entity and its queue item.
    useOntologyStore.temporal.getState().undo();
    expect(useOntologyStore.getState().classes).toHaveLength(1);
    expect(useOntologyStore.getState().pendingChanges).toHaveLength(1);
  });
});
