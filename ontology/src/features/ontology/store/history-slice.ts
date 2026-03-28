'use client';

import type { HistorySlice, SliceCreator } from './types';

function generateId(): string {
  return crypto.randomUUID();
}

export const createHistorySlice: SliceCreator<HistorySlice> = (set) => ({
  pendingChanges: [],

  addChange: (change) =>
    set((state) => ({
      pendingChanges: [
        ...state.pendingChanges,
        { ...change, id: generateId(), timestamp: new Date().toISOString() },
      ],
    })),

  clearChanges: () => set({ pendingChanges: [] }),
});
