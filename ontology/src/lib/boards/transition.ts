// PRD-PF-G: 액션 아이템 상태 전이 가드(앱계층 1차 방어; DB CHECK 이 2차).
// ★완전자동 금지★: confirmed/dismissed 는 반드시 행위자+사유 동반. 전이 그래프도 강제.
export type ActionStatus = 'pending' | 'in_review' | 'confirmed' | 'dismissed';

const ALLOWED: Record<ActionStatus, ActionStatus[]> = {
  pending: ['in_review', 'confirmed', 'dismissed'],
  in_review: ['confirmed', 'dismissed', 'pending'],
  confirmed: [], // 종결(되돌리기는 역커밋/신규 아이템으로)
  dismissed: [],
};

const RESOLVING: ActionStatus[] = ['confirmed', 'dismissed'];

export interface TransitionInput {
  from: ActionStatus;
  to: ActionStatus;
  resolvedBy?: string | null;
  resolutionNote?: string | null;
}
export interface TransitionResult {
  ok: boolean;
  error?: string;
}

export function validateTransition(input: TransitionInput): TransitionResult {
  if (input.from === input.to) return { ok: false, error: '동일 상태로의 전이' };
  if (!ALLOWED[input.from].includes(input.to)) {
    return { ok: false, error: `허용되지 않은 전이: ${input.from} → ${input.to}` };
  }
  if (RESOLVING.includes(input.to)) {
    if (!input.resolvedBy) return { ok: false, error: '확정/기각에는 행위자가 필요합니다.' };
    if (!input.resolutionNote || input.resolutionNote.trim() === '') {
      return { ok: false, error: '확정/기각에는 사유가 필요합니다.' };
    }
  }
  return { ok: true };
}

export function isResolving(to: ActionStatus): boolean {
  return RESOLVING.includes(to);
}
