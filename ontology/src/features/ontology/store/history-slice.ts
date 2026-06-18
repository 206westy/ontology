'use client';

import type { HistorySlice, SliceCreator } from './types';
import { uuid } from '../lib/uuid';

function generateId(): string {
  return uuid();
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
