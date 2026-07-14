'use client';

import { create } from 'zustand';
import type { ProblemDetail } from '../api';
import type { WorkflowState } from '../workflow';

// PRD-PF-C M3: 문제 워크플로우 셸 상태(스텝퍼·confirm-gate 공유). 그래프 편집 스토어와 분리 —
// 단계 상태·확정만 담고, 캔버스 undo/redo 스택과 섞지 않는다(§3 상태관리).
interface ProblemWorkflowStore {
  detail: ProblemDetail | null;
  setDetail: (d: ProblemDetail) => void;
  /** confirm/reopen 후 서버 응답으로 workflow_state 를 갱신(스텝퍼 즉시 반영). */
  patchWorkflowState: (ws: WorkflowState) => void;
  clear: () => void;
}

export const useProblemWorkflowStore = create<ProblemWorkflowStore>((set) => ({
  detail: null,
  setDetail: (detail) => set({ detail }),
  patchWorkflowState: (ws) =>
    set((s) =>
      s.detail ? { detail: { ...s.detail, workflowState: ws } } : s,
    ),
  clear: () => set({ detail: null }),
}));
