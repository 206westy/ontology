'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { debounce } from 'es-toolkit';
import { useOntologyStore, clearChangesWithoutHistory } from './useOntologyStore';
import { commitsApi, embeddingsApi } from '../api';
import { toast } from 'sonner';
import { useLocalStorage } from 'react-use';

const AUTO_SAVE_DEBOUNCE_MS = 30_000;
// 자동 저장 실패 시 지수 백오프 재시도 (시도 간격 1.5s → 3s → 6s).
const AUTO_SAVE_RETRY_BASE_MS = 1_500;
const MAX_AUTO_SAVE_RETRIES = 3;

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  // 재시도 상태. pendingChanges 는 실패해도 비우지 않으므로(낙관적 업데이트 유지)
  // 다음 시도에서 그대로 재전송된다 = 사실상의 재시도 큐.
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 자기참조 setTimeout 재시도용 — 항상 최신 doAutoSave 를 가리킨다.
  const doAutoSaveRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const doAutoSave = useCallback(async () => {
    if (isSavingRef.current) return;

    const state = useOntologyStore.getState();
    const pendingChanges = state.pendingChanges;
    if (pendingChanges.length === 0) return;

    isSavingRef.current = true;
    setStatus('saving');
    try {
      const message = buildAutoSaveMessage(pendingChanges);
      await commitsApi.create({
        message,
        isAutoSave: true,
        // PRD-J M2: 브랜치 모드면 브랜치 커밋으로 저장(main 미적용).
        branchId: state.currentBranch?.id ?? null,
        details: pendingChanges.map((c) => ({
          operation: c.operation as 'ADD' | 'MOD' | 'DEL',
          targetTable: c.targetTable,
          targetId: c.targetId,
          beforeSnapshot: c.beforeSnapshot ?? null,
          afterSnapshot: c.afterSnapshot ?? null,
        })),
      });
      clearChangesWithoutHistory();
      retryCountRef.current = 0;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      // PRD-E P2-2: 커밋 후 임베딩 생성 트리거 (논블로킹).
      // PRD-J M2: 브랜치 엔티티는 Supabase 에 없으므로 브랜치 모드에선 스킵.
      if (!state.currentBranch) {
        void embeddingsApi.process().catch(() => {});
      }
      setStatus('saved');
      toast.success('자동 저장 완료', {
        description: message,
        duration: 2000,
      });
    } catch {
      // C3: 실패를 더 이상 삼키지 않는다. pendingChanges 는 유지(데이터 손실 차단)하고
      // 사용자에게 알린 뒤 지수 백오프로 재시도한다.
      setStatus('error');
      const canRetry = retryCountRef.current < MAX_AUTO_SAVE_RETRIES;
      if (canRetry) {
        retryCountRef.current += 1;
        const delay = AUTO_SAVE_RETRY_BASE_MS * 2 ** (retryCountRef.current - 1);
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          void doAutoSaveRef.current();
        }, delay);
        toast.error('자동 저장 실패 — 재시도 중', {
          description: `변경사항이 아직 저장되지 않았습니다 (${retryCountRef.current}/${MAX_AUTO_SAVE_RETRIES}).`,
          duration: 4000,
        });
      } else {
        toast.error('자동 저장 실패', {
          description:
            '변경사항이 저장되지 않았습니다. 네트워크를 확인하고 다시 시도하세요.',
          action: {
            label: '다시 시도',
            onClick: () => {
              retryCountRef.current = 0;
              void doAutoSaveRef.current();
            },
          },
          duration: 10_000,
        });
      }
    } finally {
      isSavingRef.current = false;
    }
  }, []);

  doAutoSaveRef.current = doAutoSave;

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
        branchId: state.currentBranch?.id ?? null,
        details: state.pendingChanges.map((c) => ({
          operation: c.operation,
          targetTable: c.targetTable,
          targetId: c.targetId,
          beforeSnapshot: c.beforeSnapshot ?? null,
          afterSnapshot: c.afterSnapshot ?? null,
        })),
      });

      const blob = new Blob([payload], { type: 'application/json' });
      const queued = navigator.sendBeacon('/api/commits', blob);
      // sendBeacon 이 큐잉에 실패(페이로드 과대/큐 포화)하면 keepalive fetch 로 폴백.
      // keepalive 요청은 문서 언로드 후에도 전송이 보장된다.
      if (!queued) {
        void fetch('/api/commits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
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

  // 언마운트 시 대기 중인 재시도 타이머 정리.
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => !prev);
  }, [setEnabled]);

  const retry = useCallback(() => {
    retryCountRef.current = 0;
    void doAutoSaveRef.current();
  }, []);

  return {
    enabled: enabled ?? true,
    toggle,
    status,
    retry,
  };
}
