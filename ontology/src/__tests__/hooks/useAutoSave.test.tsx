import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// C3 regression: a failed auto-save must be surfaced (status='error' + toast)
// and must NOT discard pendingChanges (no silent data loss).
const createMock = vi.fn();
vi.mock('@/features/ontology/api', () => ({
  commitsApi: { create: (...args: unknown[]) => createMock(...args) },
  embeddingsApi: { process: vi.fn().mockResolvedValue({}) },
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) },
}));

import { useAutoSave } from '@/features/ontology/hooks/useAutoSave';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';

function addPendingChange() {
  useOntologyStore.getState().addChange({
    operation: 'ADD',
    targetTable: 'classes',
    targetId: 'class-1',
    targetName: 'Person',
    afterSnapshot: { name: 'Person' },
  });
}

describe('useAutoSave', () => {
  beforeEach(() => {
    createMock.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    useOntologyStore.getState().clearChanges();
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('surfaces failure and preserves pending changes when save fails', async () => {
    createMock.mockRejectedValue(new Error('network down'));
    addPendingChange();

    const { result, unmount } = renderHook(() => useAutoSave());

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(toastError).toHaveBeenCalled();
    // Data must survive a failed save so it can be retried.
    expect(useOntologyStore.getState().pendingChanges.length).toBeGreaterThan(0);

    unmount(); // clear the scheduled retry timer
  });

  it('clears pending changes and marks saved on success', async () => {
    createMock.mockResolvedValue({ id: 'commit-1' });
    addPendingChange();

    const { result, unmount } = renderHook(() => useAutoSave());

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(useOntologyStore.getState().pendingChanges).toHaveLength(0);
    expect(toastSuccess).toHaveBeenCalled();

    unmount();
  });
});
