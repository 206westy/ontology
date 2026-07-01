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
      // H3: pendingChanges 는 undo/redo 와 함께 일관되게 되돌아가야 하므로
      // 히스토리에 포함한다(사용자 편집을 undo 하면 그 변경 큐 항목도 함께 되돌아감).
      // 단, autosave/수동커밋/푸시의 *프로그램적* clearChanges() 는 undo 스냅샷을
      // 만들지 않도록 호출부에서 temporal.pause()/resume() 로 감싼다(withoutHistory).
      // 이렇게 하면 clearChanges 후 undo 가 이미 커밋된 변경을 큐에 되살리는 버그가 사라진다.
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

// H3: pendingChanges 를 undo 히스토리에 남기지 않고 비운다.
// autosave/수동 커밋/Neo4j 푸시처럼 "프로그램적"으로 큐를 비우는 경우에만 사용한다.
// (사용자 편집의 clearChanges 와 달리, 이 비우기는 undo 로 되살아나면 안 된다 —
//  되살아나면 이미 커밋/푸시된 변경이 재전송된다.)
export function clearChangesWithoutHistory(): void {
  const temporal = useOntologyStore.temporal.getState();
  temporal.pause();
  try {
    useOntologyStore.getState().clearChanges();
  } finally {
    temporal.resume();
  }
}

type TemporalState = ReturnType<typeof useOntologyStore.temporal.getState>;

export const useTemporalStore = <T>(selector: (state: TemporalState) => T): T => {
  return useStore(useOntologyStore.temporal, selector);
};
