import { describe, it, expect } from 'vitest';
import {
  materializeBranchState,
  isSnapshotVersionSupported,
  type BranchSnapshot,
  type ReplayDetail,
} from '@/features/ontology/lib/branch-replay';
import type { OntologyClass } from '@/features/ontology/lib/types';

// PRD-J M2: 브랜치 체크아웃 재생 엔진 — 스냅샷 + 커밋 details 재생의 결정성 검증.

const cls = (id: string, name: string): OntologyClass =>
  ({
    id,
    parentId: null,
    partitionId: 'p1',
    name,
    description: '',
    color: '#7c3aed',
    positionX: 0,
    positionY: 0,
    createdAt: '2026-07-06T00:00:00Z',
    updatedAt: '2026-07-06T00:00:00Z',
    sourceType: null,
    confidence: null,
    evidence: null,
  }) as OntologyClass;

const emptySnapshot = (over?: Partial<BranchSnapshot>): BranchSnapshot => ({
  schemaVersion: 1,
  classes: [],
  properties: [],
  instances: [],
  instanceValues: [],
  relationTypes: [],
  edges: [],
  ...over,
});

const detail = (
  operation: 'ADD' | 'MOD' | 'DEL',
  targetTable: string,
  targetId: string,
  afterSnapshot?: Record<string, unknown> | null,
): ReplayDetail => ({ operation, targetTable, targetId, afterSnapshot });

describe('materializeBranchState', () => {
  it('스냅샷 그대로 반환 (커밋 없음)', () => {
    const snap = emptySnapshot({ classes: [cls('c1', 'A')] });
    const state = materializeBranchState(snap, []);
    expect(state.classes).toHaveLength(1);
    expect(state.classes[0].name).toBe('A');
  });

  it('ADD 재생 — 새 엔티티 추가', () => {
    const state = materializeBranchState(emptySnapshot(), [
      detail('ADD', 'classes', 'c1', cls('c1', 'New') as unknown as Record<string, unknown>),
    ]);
    expect(state.classes).toHaveLength(1);
    expect(state.classes[0].name).toBe('New');
  });

  it('MOD 재생 — 기존 엔티티 교체', () => {
    const snap = emptySnapshot({ classes: [cls('c1', 'Old')] });
    const state = materializeBranchState(snap, [
      detail('MOD', 'classes', 'c1', cls('c1', 'Renamed') as unknown as Record<string, unknown>),
    ]);
    expect(state.classes).toHaveLength(1);
    expect(state.classes[0].name).toBe('Renamed');
  });

  it('DEL 재생 — 제거', () => {
    const snap = emptySnapshot({ classes: [cls('c1', 'A'), cls('c2', 'B')] });
    const state = materializeBranchState(snap, [detail('DEL', 'classes', 'c1')]);
    expect(state.classes.map((c) => c.id)).toEqual(['c2']);
  });

  it('같은 대상 ADD→MOD 순서 보존 — 최종 상태는 MOD', () => {
    const state = materializeBranchState(emptySnapshot(), [
      detail('ADD', 'classes', 'c1', cls('c1', 'First') as unknown as Record<string, unknown>),
      detail('MOD', 'classes', 'c1', cls('c1', 'Second') as unknown as Record<string, unknown>),
    ]);
    expect(state.classes).toHaveLength(1);
    expect(state.classes[0].name).toBe('Second');
  });

  it('ADD→DEL 순서 — 최종적으로 없음', () => {
    const state = materializeBranchState(emptySnapshot(), [
      detail('ADD', 'classes', 'c1', cls('c1', 'Temp') as unknown as Record<string, unknown>),
      detail('DEL', 'classes', 'c1'),
    ]);
    expect(state.classes).toHaveLength(0);
  });

  it('재체크아웃 멱등 — 같은 ADD 두 번 재생해도 중복 없음', () => {
    const d = detail('ADD', 'classes', 'c1', cls('c1', 'Once') as unknown as Record<string, unknown>);
    const state = materializeBranchState(emptySnapshot(), [d, d]);
    expect(state.classes).toHaveLength(1);
  });

  it('afterSnapshot 없는 ADD/MOD 는 스킵(손상 이력 방어)', () => {
    const state = materializeBranchState(emptySnapshot(), [
      detail('ADD', 'classes', 'c1', null),
      detail('MOD', 'classes', 'c2', undefined),
    ]);
    expect(state.classes).toHaveLength(0);
  });

  it('스토어 밖 테이블(constraints 등)은 무시', () => {
    const state = materializeBranchState(emptySnapshot(), [
      detail('ADD', 'constraints', 'x1', { id: 'x1' }),
    ]);
    expect(state.classes).toHaveLength(0);
  });

  it('테이블별 독립 재생 — instance_values/relation_types 키 매핑', () => {
    const state = materializeBranchState(emptySnapshot(), [
      detail('ADD', 'relation_types', 'r1', { id: 'r1', name: '포함함' }),
      detail('ADD', 'instance_values', 'v1', { id: 'v1', value: '42' }),
    ]);
    expect(state.relationTypes).toHaveLength(1);
    expect(state.instanceValues).toHaveLength(1);
  });

  it('입력 불변 — 원본 스냅샷을 변형하지 않는다', () => {
    const snap = emptySnapshot({ classes: [cls('c1', 'A')] });
    materializeBranchState(snap, [detail('DEL', 'classes', 'c1')]);
    expect(snap.classes).toHaveLength(1);
  });
});

describe('isSnapshotVersionSupported', () => {
  it('버전 없음(레거시)·현재 버전 허용, 미래 버전 거부', () => {
    expect(isSnapshotVersionSupported(emptySnapshot({ schemaVersion: undefined }))).toBe(true);
    expect(isSnapshotVersionSupported(emptySnapshot({ schemaVersion: 1 }))).toBe(true);
    expect(isSnapshotVersionSupported(emptySnapshot({ schemaVersion: 999 }))).toBe(false);
  });
});
