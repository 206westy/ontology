import { describe, it, expect } from 'vitest';
import { deriveLifecycleState } from './LifecycleIndicator';

// PRD-I (M4): 초안→확정→발행 3상태 파생 규칙 검증(순수 함수).
describe('deriveLifecycleState', () => {
  it('편집 대기(pending)가 있으면 타임스탬프와 무관하게 초안이다', () => {
    // Arrange
    const input = {
      hasPendingChanges: true,
      lastCommittedAt: '2026-07-02T00:00:00.000Z',
      lastPublishedAt: '2026-07-02T01:00:00.000Z',
    };

    // Act
    const result = deriveLifecycleState(input);

    // Assert
    expect(result).toBe('draft');
  });

  it('기록이 전혀 없으면 초안이다(기저 상태)', () => {
    const result = deriveLifecycleState({
      hasPendingChanges: false,
      lastCommittedAt: null,
      lastPublishedAt: null,
    });

    expect(result).toBe('draft');
  });

  it('대기 없이 커밋만 있으면 확정이다', () => {
    const result = deriveLifecycleState({
      hasPendingChanges: false,
      lastCommittedAt: '2026-07-02T00:00:00.000Z',
      lastPublishedAt: null,
    });

    expect(result).toBe('committed');
  });

  it('커밋 이후 발행되었으면 발행이다', () => {
    const result = deriveLifecycleState({
      hasPendingChanges: false,
      lastCommittedAt: '2026-07-02T00:00:00.000Z',
      lastPublishedAt: '2026-07-02T01:00:00.000Z',
    });

    expect(result).toBe('published');
  });

  it('발행만 있고 커밋 기록이 없어도 발행이다', () => {
    const result = deriveLifecycleState({
      hasPendingChanges: false,
      lastCommittedAt: null,
      lastPublishedAt: '2026-07-02T01:00:00.000Z',
    });

    expect(result).toBe('published');
  });

  it('발행 이후 다시 커밋했으면 확정으로 되돌아간다', () => {
    const result = deriveLifecycleState({
      hasPendingChanges: false,
      lastCommittedAt: '2026-07-02T02:00:00.000Z',
      lastPublishedAt: '2026-07-02T01:00:00.000Z',
    });

    expect(result).toBe('committed');
  });
});
