import { describe, it, expect } from 'vitest';
import {
  unlockAfterLink,
  confirmStep,
  reopenStep,
  isStepAccessible,
  type WorkflowState,
} from '@/features/problems/workflow';

// 새 문제 생성 직후 상태(define 확정, 나머지 잠금).
function initial(): WorkflowState {
  return {
    define: { state: 'confirmed', confirmedBy: 'u1', confirmedAt: 't0' },
    data: { state: 'locked' },
    studio: { state: 'locked' },
    functions: { state: 'locked' },
    board: { state: 'locked' },
  };
}

describe('workflow: unlockAfterLink', () => {
  it('온톨로지 연결 후 data·studio 를 잠금 해제한다', () => {
    // Arrange
    const ws = initial();
    // Act
    const next = unlockAfterLink(ws);
    // Assert
    expect(next.data.state).toBe('draft');
    expect(next.studio.state).toBe('draft');
    expect(next.functions.state).toBe('locked');
    expect(next.define.state).toBe('confirmed'); // 기존 확정 보존
  });

  it('원본을 변경하지 않는다(불변)', () => {
    const ws = initial();
    unlockAfterLink(ws);
    expect(ws.data.state).toBe('locked');
  });
});

describe('workflow: confirmStep', () => {
  it('studio 확정은 functions·board 게이트를 연다', () => {
    // Arrange
    const ws = unlockAfterLink(initial());
    // Act
    const next = confirmStep(ws, 'studio', 'u1', 't1');
    // Assert
    expect(next.studio.state).toBe('confirmed');
    expect(next.studio.confirmedBy).toBe('u1');
    expect(next.functions.state).toBe('draft');
    expect(next.board.state).toBe('draft');
  });

  it('data 확정은 이후 단계를 열지 않는다', () => {
    const ws = unlockAfterLink(initial());
    const next = confirmStep(ws, 'data', 'u1', 't1');
    expect(next.data.state).toBe('confirmed');
    expect(next.functions.state).toBe('locked');
  });
});

describe('workflow: reopenStep', () => {
  it('재오픈 시 해당 단계는 draft, 이후 확정 단계는 stale(파괴 없음)', () => {
    // Arrange
    let ws = unlockAfterLink(initial());
    ws = confirmStep(ws, 'studio', 'u1', 't1'); // functions/board = draft
    ws = confirmStep(ws, 'functions', 'u1', 't2'); // functions = confirmed
    // Act
    const next = reopenStep(ws, 'studio');
    // Assert
    expect(next.studio.state).toBe('draft');
    expect(next.functions.state).toBe('stale');
    expect(next.board.state).toBe('stale');
  });

  it('잠긴 이후 단계는 stale 로 바꾸지 않는다', () => {
    const ws = initial(); // data/studio 잠김
    const next = reopenStep(ws, 'define');
    expect(next.data.state).toBe('locked');
  });
});

describe('workflow: isStepAccessible', () => {
  it('locked 단계만 접근 불가', () => {
    const ws = initial();
    expect(isStepAccessible(ws, 'define')).toBe(true);
    expect(isStepAccessible(ws, 'studio')).toBe(false);
    expect(isStepAccessible(unlockAfterLink(ws), 'studio')).toBe(true);
  });
});
