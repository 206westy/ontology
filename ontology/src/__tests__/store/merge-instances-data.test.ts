import { describe, it, expect, beforeEach } from 'vitest';
import {
  useOntologyStore,
  mergeInstancesDataWithoutHistory,
} from '@/features/ontology/hooks/useOntologyStore';

// PRD-Perf M3-3: 인스턴스 지연 로드 2단계 병합 계약.
// loadOntology 와 달리 (1) pendingChanges·선택을 리셋하지 않고,
// (2) 로드 창 사이에 사용자가 추가한 로컬 전용 인스턴스를 보존하며,
// (3) undo 스냅샷을 남기지 않는다("스키마만 있던 상태"로 undo 금지).
describe('mergeInstancesData — 지연 인스턴스 병합', () => {
  beforeEach(() => {
    useOntologyStore.getState().clearOntology();
    useOntologyStore.getState().clearChanges();
    useOntologyStore.temporal.getState().clear();
  });

  it('서버 인스턴스를 채우되 로컬 전용(방금 추가) 인스턴스를 보존한다', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Person' });
    // 로드 창 사이 사용자가 방금 추가한 로컬 인스턴스(서버 목록에 아직 없음)
    useOntologyStore.getState().addInstance({ id: 'local-1', classId: 'c1', name: 'LocalDog' });

    mergeInstancesDataWithoutHistory({
      instances: [
        {
          id: 'srv-1',
          classId: 'c1',
          name: 'ServerCat',
          description: null,
          createdAt: '',
          updatedAt: '',
        } as never,
      ],
      instanceValues: [],
    });

    const names = useOntologyStore.getState().instances.map((i) => i.name).sort();
    expect(names).toEqual(['LocalDog', 'ServerCat']);
  });

  it('pendingChanges 를 리셋하지 않는다 (loadOntology 와 다른 계약)', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Person' });
    const before = useOntologyStore.getState().pendingChanges.length;
    expect(before).toBeGreaterThan(0);

    mergeInstancesDataWithoutHistory({ instances: [], instanceValues: [] });

    expect(useOntologyStore.getState().pendingChanges.length).toBe(before);
  });

  it('undo 스냅샷을 남기지 않는다 — undo 해도 병합된 인스턴스가 사라지지 않는다', () => {
    useOntologyStore.getState().addClass({ id: 'c1', name: 'Person' });
    mergeInstancesDataWithoutHistory({
      instances: [
        {
          id: 'srv-1',
          classId: 'c1',
          name: 'ServerCat',
          description: null,
          createdAt: '',
          updatedAt: '',
        } as never,
      ],
      instanceValues: [],
    });

    // undo 는 addClass 를 되돌릴 수는 있어도, 병합 자체는 스냅샷이 아니므로
    // "인스턴스 없던 시점"이 히스토리에 존재하지 않는다.
    const pastStates = useOntologyStore.temporal.getState().pastStates;
    const hasSnapshotWithoutServerCat = pastStates.some(
      (s) =>
        Array.isArray(s.instances) &&
        s.instances.length === 0 &&
        Array.isArray(s.classes) &&
        s.classes.length > 0,
    );
    expect(hasSnapshotWithoutServerCat).toBe(false);
  });
});
