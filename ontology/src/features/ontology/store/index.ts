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

// PRD-Perf M3-3: 지연 도착한 인스턴스 데이터 병합은 하이드레이션이지 사용자 편집이
// 아니다 — undo 스냅샷 없이 반영한다("스키마만 있던 상태"로 undo 되는 사고 방지).
export function mergeInstancesDataWithoutHistory(data: {
  instances: Parameters<OntologyStore['mergeInstancesData']>[0]['instances'];
  instanceValues: Parameters<OntologyStore['mergeInstancesData']>[0]['instanceValues'];
}): void {
  const temporal = useOntologyStore.temporal.getState();
  temporal.pause();
  try {
    useOntologyStore.getState().mergeInstancesData(data);
  } finally {
    temporal.resume();
  }
}

// PRD-Perf M1-2: 드래그로 인한 위치 영속은 시각 배치일 뿐 undo 대상이 아니다.
// clearChangesWithoutHistory 와 같은 pause/resume 패턴으로 스냅샷 없이 기록한다.
// (pendingChanges 에는 그대로 쌓여 autosave 가 위치를 영속한다 — 동작 불변.)
export function updateClassPositionWithoutHistory(
  id: string,
  position: { positionX: number; positionY: number },
): void {
  const temporal = useOntologyStore.temporal.getState();
  temporal.pause();
  try {
    useOntologyStore.getState().updateClass(id, position);
  } finally {
    temporal.resume();
  }
}

type TemporalState = ReturnType<typeof useOntologyStore.temporal.getState>;

export const useTemporalStore = <T>(selector: (state: TemporalState) => T): T => {
  return useStore(useOntologyStore.temporal, selector);
};
