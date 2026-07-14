// PRD-PF-I §5-3: 경량 상태머신. 정의되지 않은 전이는 애플리케이션 레이어에서 차단(DB 커밋 안 됨).
export interface StateItem {
  key: string;
  label?: string;
  badge_style?: string;
}
export interface StateTransition {
  from: string;
  to: string;
  trigger?: 'user' | 'automation';
  guard?: string;
}
export interface StateDef {
  states: StateItem[];
  initialState: string;
  transitions: StateTransition[];
}
export interface TransitionCheck {
  ok: boolean;
  error?: string;
}

export function validateStateTransition(
  def: StateDef,
  from: string | null,
  to: string,
): TransitionCheck {
  const keys = new Set(def.states.map((s) => s.key));
  if (!keys.has(to)) return { ok: false, error: `알 수 없는 상태: ${to}` };
  // 초기 상태로의 진입(from=null)은 initialState 만 허용.
  if (from === null) {
    return to === def.initialState
      ? { ok: true }
      : { ok: false, error: `초기 상태는 ${def.initialState} 이어야 합니다.` };
  }
  const allowed = def.transitions.some((t) => t.from === from && t.to === to);
  return allowed ? { ok: true } : { ok: false, error: `허용되지 않은 전이: ${from} → ${to}` };
}

// PRD-PF-I §5-3 예시 상태머신 3종(프리셋). 시각언어(파선=제안/미확정, 실선=확정) 뱃지.
export const STATE_PRESETS: Record<string, StateDef & { name: string }> = {
  wafer: {
    name: '웨이퍼',
    initialState: 'pending',
    states: [
      { key: 'pending', label: '대기', badge_style: 'dashed' },
      { key: 'pass', label: '합격', badge_style: 'solid' },
      { key: 'fail', label: '불합격', badge_style: 'solid' },
    ],
    transitions: [
      { from: 'pending', to: 'pass', trigger: 'automation' },
      { from: 'pending', to: 'fail', trigger: 'automation' },
    ],
  },
  work_order: {
    name: '작업지시',
    initialState: 'open',
    states: [
      { key: 'open', label: '접수', badge_style: 'solid' },
      { key: 'in_progress', label: '진행', badge_style: 'solid' },
      { key: 'closed', label: '완료', badge_style: 'solid' },
    ],
    transitions: [
      { from: 'open', to: 'in_progress', trigger: 'user' },
      { from: 'in_progress', to: 'closed', trigger: 'user' },
      { from: 'closed', to: 'open', trigger: 'user' }, // 재오픈
    ],
  },
  anomaly: {
    name: '이상항목',
    initialState: 'detected',
    states: [
      { key: 'detected', label: '감지', badge_style: 'dashed' },
      { key: 'reviewing', label: '검토', badge_style: 'solid' },
      { key: 'resolved', label: '해결', badge_style: 'solid' },
      { key: 'rejected', label: '기각', badge_style: 'solid' },
    ],
    transitions: [
      { from: 'detected', to: 'reviewing', trigger: 'user' },
      { from: 'reviewing', to: 'resolved', trigger: 'user' },
      { from: 'reviewing', to: 'rejected', trigger: 'user' },
    ],
  },
};
