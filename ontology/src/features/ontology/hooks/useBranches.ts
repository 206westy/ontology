'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useOntologyStore, clearChangesWithoutHistory } from './useOntologyStore';
import { branchesApi } from '../api';
import {
  materializeBranchState,
  isSnapshotVersionSupported,
} from '../lib/branch-replay';
import type { ReplayDetail } from '../lib/branch-replay';

// PRD-J M2: 브랜치 목록/생성/체크아웃.
// 체크아웃 = 베이스 스냅샷 로드 + 브랜치 커밋 재생 → 스토어 교체.
// main 복귀 = 엔티티 쿼리 무효화 → useLoadOntology 가 main 데이터로 재적재.

export const BRANCHES_KEY = ['branches'] as const;

// main 재적재를 위해 무효화할 엔티티 쿼리 키(useLoadOntology 가 구독하는 7종).
const ENTITY_QUERY_KEYS = [
  ['classes'],
  ['instances'],
  ['properties'],
  ['edges'],
  ['relationTypes'],
  ['instance-values'],
  ['partitions'],
] as const;

export function useBranchList(status: 'active' | 'all' = 'active') {
  return useQuery({
    queryKey: [...BRANCHES_KEY, status],
    queryFn: () => branchesApi.list(status),
    staleTime: 10_000,
  });
}

// 체크아웃/복귀 전 공통 가드: 미저장 변경이 있으면 전환을 막는다(유실 방지).
function guardNoPendingChanges(): boolean {
  const pending = useOntologyStore.getState().pendingChanges;
  if (pending.length === 0) return true;
  toast.error('저장되지 않은 변경이 있습니다', {
    description: `변경 ${pending.length}건을 먼저 저장(커밋)하거나 되돌린 뒤 전환하세요.`,
  });
  return false;
}

// 브랜치 전환 시 undo 히스토리를 비운다 — 경계를 넘는 undo 는
// 다른 브랜치의 상태를 현재 브랜치에 되살리는 사고가 된다.
function clearUndoHistory() {
  useOntologyStore.temporal.getState().clear();
}

export function useBranchActions() {
  const qc = useQueryClient();
  const setCurrentBranch = useOntologyStore((s) => s.setCurrentBranch);
  const loadOntology = useOntologyStore((s) => s.loadOntology);

  const checkoutBranch = useCallback(
    async (branchId: string) => {
      if (!guardNoPendingChanges()) return false;

      const { branch, commits } = await branchesApi.get(branchId);
      if (branch.status !== 'active') {
        toast.error('활성 상태가 아닌 브랜치는 체크아웃할 수 없습니다.');
        return false;
      }
      const snapshot = branch.baseSnapshot;
      if (!isSnapshotVersionSupported(snapshot)) {
        toast.error('이 브랜치의 스냅샷 버전을 열 수 없습니다', {
          description: '앱을 최신 버전으로 업데이트한 뒤 다시 시도하세요.',
        });
        return false;
      }

      // 커밋(오래된 순) → details(커밋 내 seq 순, 서버 정렬) 평탄화 후 재생.
      const details: ReplayDetail[] = commits.flatMap((c) => c.details);
      const state = materializeBranchState(snapshot, details);

      clearChangesWithoutHistory();
      loadOntology({
        classes: state.classes,
        instances: state.instances,
        properties: state.properties,
        relationTypes: state.relationTypes,
        edges: state.edges,
        instanceValues: state.instanceValues,
      });
      setCurrentBranch({ id: branch.id, name: branch.name });
      clearUndoHistory();
      toast.success(`'${branch.name}' 브랜치로 전환했습니다`, {
        description: '이 브랜치의 변경은 main에 영향을 주지 않습니다.',
      });
      return true;
    },
    [loadOntology, setCurrentBranch],
  );

  const checkoutMain = useCallback(async () => {
    if (!guardNoPendingChanges()) return false;

    setCurrentBranch(null);
    clearChangesWithoutHistory();
    clearUndoHistory();
    // 엔티티 쿼리 무효화 → 리페치 → useLoadOntology 가 main 상태로 재적재.
    await Promise.all(
      ENTITY_QUERY_KEYS.map((key) =>
        qc.invalidateQueries({ queryKey: [...key] }),
      ),
    );
    toast.success('main으로 돌아왔습니다');
    return true;
  }, [qc, setCurrentBranch]);

  const createBranch = useCallback(
    async (name: string, description = '') => {
      // 분기 기준(base)을 명확히 하기 위해 미저장 변경 없이 분기한다.
      if (!guardNoPendingChanges()) return null;
      const currentBranch = useOntologyStore.getState().currentBranch;
      if (currentBranch) {
        toast.error('브랜치 안에서는 분기할 수 없습니다', {
          description: 'main으로 돌아간 뒤 새 브랜치를 만드세요.',
        });
        return null;
      }

      const created = await branchesApi.create({ name, description });
      await qc.invalidateQueries({ queryKey: [...BRANCHES_KEY] });
      return created;
    },
    [qc],
  );

  return { checkoutBranch, checkoutMain, createBranch };
}
