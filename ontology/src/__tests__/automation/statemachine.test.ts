import { describe, it, expect } from 'vitest';
import { validateStateTransition, STATE_PRESETS } from '@/lib/automation/statemachine';

const wo = STATE_PRESETS.work_order;

describe('validateStateTransition', () => {
  it('정의된 전이만 허용', () => {
    expect(validateStateTransition(wo, 'open', 'in_progress').ok).toBe(true);
    expect(validateStateTransition(wo, 'in_progress', 'closed').ok).toBe(true);
    expect(validateStateTransition(wo, 'closed', 'open').ok).toBe(true); // 재오픈
  });

  it('정의되지 않은 전이 차단', () => {
    expect(validateStateTransition(wo, 'open', 'closed').ok).toBe(false); // 직행 없음
    expect(validateStateTransition(wo, 'closed', 'in_progress').ok).toBe(false);
  });

  it('알 수 없는 상태 차단', () => {
    expect(validateStateTransition(wo, 'open', 'archived').ok).toBe(false);
  });

  it('초기 진입(from=null)은 initialState 만', () => {
    expect(validateStateTransition(wo, null, 'open').ok).toBe(true);
    expect(validateStateTransition(wo, null, 'closed').ok).toBe(false);
  });

  it('프리셋 3종 존재(웨이퍼·작업지시·이상항목)', () => {
    expect(Object.keys(STATE_PRESETS).sort()).toEqual(['anomaly', 'wafer', 'work_order']);
  });
});
