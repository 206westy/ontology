'use client';

import { useEffect, useRef, useCallback } from 'react';
import { debounce } from 'es-toolkit';
import { useOntologyStore } from './useOntologyStore';
import { commitsApi, embeddingsApi } from '../api';
import { toast } from 'sonner';
import { useLocalStorage } from 'react-use';

const AUTO_SAVE_DEBOUNCE_MS = 30_000;

function buildAutoSaveMessage(
  changes: { operation: string; targetTable: string }[],
): string {
  const counts: Record<string, Record<string, number>> = {};
  for (const c of changes) {
    if (!counts[c.operation]) counts[c.operation] = {};
    counts[c.operation][c.targetTable] =
      (counts[c.operation][c.targetTable] ?? 0) + 1;
  }

  const parts: string[] = [];
  const tableLabels: Record<string, string> = {
    classes: '클래스',
    instances: '인스턴스',
    properties: '프로퍼티',
    edges: '관계',
    relation_types: '관계 타입',
    axioms: '공리',
    instance_values: '인스턴스 값',
  };
  const opLabels: Record<string, string> = {
    ADD: '추가',
    MOD: '수정',
    DEL: '삭제',
  };

  for (const [op, tables] of Object.entries(counts)) {
    for (const [table, count] of Object.entries(tables)) {
      const label = tableLabels[table] ?? table;
      const opLabel = opLabels[op] ?? op;
      parts.push(`${label} ${count}개 ${opLabel}`);
    }
  }

  return parts.length > 0 ? parts.join(', ') : '자동 저장';
}

export function useAutoSave() {
  const [enabled, setEnabled] = useLocalStorage('auto-save-enabled', true);
  const isSavingRef = useRef(false);

  const doAutoSave = useCallback(async () => {
    if (isSavingRef.current) return;

    const state = useOntologyStore.getState();
    const pendingChanges = state.pendingChanges;
    if (pendingChanges.length === 0) return;

    isSavingRef.current = true;
    try {
      const message = buildAutoSaveMessage(pendingChanges);
      await commitsApi.create({
        message,
        isAutoSave: true,
        details: pendingChanges.map((c) => ({
          operation: c.operation as 'ADD' | 'MOD' | 'DEL',
          targetTable: c.targetTable,
          targetId: c.targetId,
          beforeSnapshot: c.beforeSnapshot ?? null,
          afterSnapshot: c.afterSnapshot ?? null,
        })),
      });
      state.clearChanges();
      // PRD-E P2-2: 커밋 후 임베딩 생성 트리거 (논블로킹).
      void embeddingsApi.process().catch(() => {});
      toast.success('자동 저장 완료', {
        description: message,
        duration: 2000,
      });
    } catch {
      // Silent fail for auto-save — don't disrupt user
      console.error('[AutoSave] Failed to auto-save');
    } finally {
      isSavingRef.current = false;
    }
  }, []);

  const debouncedSave = useRef(
    debounce(doAutoSave, AUTO_SAVE_DEBOUNCE_MS),
  ).current;

  // Watch pendingChanges and trigger debounced save
  useEffect(() => {
    if (!enabled) return;

    const unsub = useOntologyStore.subscribe((state, prevState) => {
      if (
        state.pendingChanges.length > 0 &&
        state.pendingChanges.length !== prevState.pendingChanges.length
      ) {
        debouncedSave();
      }
    });

    return () => {
      unsub();
      debouncedSave.cancel();
    };
  }, [enabled, debouncedSave]);

  // beforeunload: flush pending changes immediately
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = () => {
      const state = useOntologyStore.getState();
      if (state.pendingChanges.length === 0) return;

      const message = buildAutoSaveMessage(state.pendingChanges);
      const payload = JSON.stringify({
        message,
        isAutoSave: true,
        details: state.pendingChanges.map((c) => ({
          operation: c.operation,
          targetTable: c.targetTable,
          targetId: c.targetId,
          beforeSnapshot: c.beforeSnapshot ?? null,
          afterSnapshot: c.afterSnapshot ?? null,
        })),
      });

      navigator.sendBeacon(
        '/api/commits',
        new Blob([payload], { type: 'application/json' }),
      );
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled]);

  // visibilitychange: save when tab goes hidden
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        doAutoSave();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, doAutoSave]);

  const toggle = useCallback(() => {
    setEnabled((prev) => !prev);
  }, [setEnabled]);

  return {
    enabled: enabled ?? true,
    toggle,
  };
}
