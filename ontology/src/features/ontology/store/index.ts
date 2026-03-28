'use client';

import { create } from 'zustand';
import { useStore } from 'zustand';
import { temporal } from 'zundo';

import type { OntologyStore } from './types';
import { createEntitySlice } from './entity-slice';
import { createUiSlice } from './ui-slice';
import { createHistorySlice } from './history-slice';

export type { OntologyStore, EntitySlice, UiSlice, HistorySlice } from './types';

export const useOntologyStore = create<OntologyStore>()(
  temporal(
    (...args) => ({
      ...createEntitySlice(...args),
      ...createUiSlice(...args),
      ...createHistorySlice(...args),
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

type TemporalState = ReturnType<typeof useOntologyStore.temporal.getState>;

export const useTemporalStore = <T>(selector: (state: TemporalState) => T): T => {
  return useStore(useOntologyStore.temporal, selector);
};
