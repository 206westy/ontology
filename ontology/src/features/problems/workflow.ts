// PRD-PF-C M3: workflow_state 전이(순수·불변). confirm-gate 는 최소화 —
// 엄격 게이트는 define→ontology-link, studio→functions/board 만(§5.5 R1). data↔studio 자유.

import { WORKFLOW_STEPS, type WorkflowStep } from './schemas';

export type StepState = 'locked' | 'draft' | 'confirmed' | 'stale';

export interface StepEntry {
  state: StepState;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
}

export type WorkflowState = Record<string, StepEntry>;

const ORDER: readonly WorkflowStep[] = WORKFLOW_STEPS;

function set(ws: WorkflowState, step: string, entry: StepEntry): WorkflowState {
  return { ...ws, [step]: entry };
}

function get(ws: WorkflowState, step: string): StepEntry {
  return ws[step] ?? { state: 'locked' };
}

/**
 * 온톨로지 연결 확정 직후: data·studio 를 잠금 해제(draft). 이미 진행된 단계는 보존.
 * data↔studio 자유 왕복(R1)이므로 둘 다 즉시 접근 가능하게 연다.
 */
export function unlockAfterLink(ws: WorkflowState): WorkflowState {
  let next = ws;
  for (const step of ['data', 'studio'] as const) {
    if (get(next, step).state === 'locked') {
      next = set(next, step, { state: 'draft' });
    }
  }
  return next;
}

/**
 * 단계 확정: 해당 단계를 confirmed(감사 by/at)로. studio 확정은 functions·board 게이트를 연다.
 */
export function confirmStep(
  ws: WorkflowState,
  step: WorkflowStep,
  userId: string,
  nowIso: string,
): WorkflowState {
  let next = set(ws, step, {
    state: 'confirmed',
    confirmedBy: userId,
    confirmedAt: nowIso,
  });
  if (step === 'studio') {
    for (const later of ['functions', 'board'] as const) {
      if (get(next, later).state === 'locked') {
        next = set(next, later, { state: 'draft' });
      }
    }
  }
  return next;
}

/**
 * 재오픈: 해당 단계를 draft 로 되돌리고, 이후 단계 중 잠기지 않은 것들을 stale 로 표시(경고만, 데이터 파괴 없음).
 */
export function reopenStep(ws: WorkflowState, step: WorkflowStep): WorkflowState {
  const idx = ORDER.indexOf(step);
  let next = set(ws, step, { ...get(ws, step), state: 'draft' });
  for (let i = idx + 1; i < ORDER.length; i++) {
    const later = ORDER[i];
    const cur = get(next, later).state;
    if (cur === 'confirmed' || cur === 'draft') {
      next = set(next, later, { ...get(next, later), state: 'stale' });
    }
  }
  return next;
}

/** 단계 접근 가능 여부(잠긴 단계 직접 URL 접근 차단 판정). */
export function isStepAccessible(ws: WorkflowState, step: WorkflowStep): boolean {
  return get(ws, step).state !== 'locked';
}
