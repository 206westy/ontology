import { describe, it, expect } from 'vitest';
import { validateTransition } from '@/lib/boards/transition';

describe('validateTransition (완전자동 금지 가드)', () => {
  it('확정에는 행위자+사유가 필수', () => {
    expect(validateTransition({ from: 'pending', to: 'confirmed' }).ok).toBe(false);
    expect(
      validateTransition({ from: 'pending', to: 'confirmed', resolvedBy: 'u1' }).ok,
    ).toBe(false);
    expect(
      validateTransition({ from: 'pending', to: 'confirmed', resolvedBy: 'u1', resolutionNote: '  ' }).ok,
    ).toBe(false);
    expect(
      validateTransition({ from: 'pending', to: 'confirmed', resolvedBy: 'u1', resolutionNote: '재작업 지시' }).ok,
    ).toBe(true);
  });

  it('기각도 동일하게 사유 강제', () => {
    expect(validateTransition({ from: 'in_review', to: 'dismissed', resolvedBy: 'u1' }).ok).toBe(false);
    expect(
      validateTransition({ from: 'in_review', to: 'dismissed', resolvedBy: 'u1', resolutionNote: '오탐' }).ok,
    ).toBe(true);
  });

  it('허용되지 않은 전이 차단(종결 상태에서 이동 불가)', () => {
    expect(validateTransition({ from: 'confirmed', to: 'pending' }).ok).toBe(false);
    expect(validateTransition({ from: 'dismissed', to: 'in_review' }).ok).toBe(false);
    expect(validateTransition({ from: 'pending', to: 'pending' }).ok).toBe(false);
  });

  it('검토 착수(in_review)는 사유 불필요', () => {
    expect(validateTransition({ from: 'pending', to: 'in_review' }).ok).toBe(true);
  });
});
