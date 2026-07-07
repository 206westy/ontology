'use client';

// Re-export from the new sliced store for backward compatibility.
// All existing imports of useOntologyStore and useTemporalStore continue to work.
export {
  useOntologyStore,
  useTemporalStore,
  clearChangesWithoutHistory,
  updateClassPositionWithoutHistory,
  mergeInstancesDataWithoutHistory,
} from '../store';
export type { OntologyStore, EntitySlice, UiSlice, HistorySlice } from '../store';
