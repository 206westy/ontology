import { describe, it, expect } from 'vitest';
import {
  computeNetDelta,
  buildMergePlan,
  applyResolutions,
  sortForApplication,
  type DiffDetail,
} from '@/features/ontology/lib/merge-diff';

// PRD-J M3: 3-way 병합 diff — 순변화 접기·충돌 판정·해소 반영 검증.

const d = (
  operation: 'ADD' | 'MOD' | 'DEL',
  targetTable: string,
  targetId: string,
  after?: Record<string, unknown> | null,
  before?: Record<string, unknown> | null,
): DiffDetail => ({
  operation,
  targetTable,
  targetId,
  afterSnapshot: after ?? null,
  beforeSnapshot: before ?? null,
});

describe('computeNetDelta', () => {
  it('ADD→MOD 는 ADD(최종 after)로 접힌다', () => {
    const net = computeNetDelta([
      d('ADD', 'classes', 'c1', { name: 'v1' }),
      d('MOD', 'classes', 'c1', { name: 'v2' }),
    ]);
    const change = net.get('classes:c1')!;
    expect(change.operation).toBe('ADD');
    expect(change.afterSnapshot).toEqual({ name: 'v2' });
  });

  it('ADD→DEL 은 무변화(맵에서 제거)', () => {
    const net = computeNetDelta([
      d('ADD', 'classes', 'c1', { name: 'tmp' }),
      d('DEL', 'classes', 'c1'),
    ]);
    expect(net.has('classes:c1')).toBe(false);
  });

  it('MOD→DEL 은 DEL, before 는 최초 것 유지', () => {
    const net = computeNetDelta([
      d('MOD', 'classes', 'c1', { name: 'v2' }, { name: 'v1' }),
      d('DEL', 'classes', 'c1'),
    ]);
    const change = net.get('classes:c1')!;
    expect(change.operation).toBe('DEL');
    expect(change.beforeSnapshot).toEqual({ name: 'v1' });
  });

  it('DEL→ADD 는 MOD(교체)로 접힌다', () => {
    const net = computeNetDelta([
      d('DEL', 'classes', 'c1', null, { name: 'old' }),
      d('ADD', 'classes', 'c1', { name: 'new' }),
    ]);
    const change = net.get('classes:c1')!;
    expect(change.operation).toBe('MOD');
    expect(change.afterSnapshot).toEqual({ name: 'new' });
  });
});

describe('buildMergePlan', () => {
  it('main 이 안 건드린 대상은 autoApply', () => {
    const mine = computeNetDelta([d('MOD', 'classes', 'c1', { name: 'B' }, { name: 'A' })]);
    const theirs = computeNetDelta([d('MOD', 'classes', 'c2', { name: 'X' })]);
    const plan = buildMergePlan(mine, theirs);
    expect(plan.autoApply).toHaveLength(1);
    expect(plan.conflicts).toHaveLength(0);
  });

  it('MOD vs MOD(다른 값) → 충돌', () => {
    const mine = computeNetDelta([d('MOD', 'classes', 'c1', { name: 'Mine' }, { name: 'Base' })]);
    const theirs = computeNetDelta([d('MOD', 'classes', 'c1', { name: 'Theirs' }, { name: 'Base' })]);
    const plan = buildMergePlan(mine, theirs);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].reason).toBe('mod-mod');
    expect(plan.conflicts[0].targetName).toBe('Mine');
  });

  it('MOD vs MOD(같은 결과) → identical (적용 불필요)', () => {
    const mine = computeNetDelta([d('MOD', 'classes', 'c1', { name: 'Same' })]);
    const theirs = computeNetDelta([d('MOD', 'classes', 'c1', { name: 'Same' })]);
    const plan = buildMergePlan(mine, theirs);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.identical).toHaveLength(1);
  });

  it('동일성 비교는 위치·타임스탬프를 무시한다', () => {
    const mine = computeNetDelta([
      d('MOD', 'classes', 'c1', { name: 'Same', positionX: 10, updatedAt: 't1' }),
    ]);
    const theirs = computeNetDelta([
      d('MOD', 'classes', 'c1', { name: 'Same', positionX: 99, updatedAt: 't2' }),
    ]);
    expect(buildMergePlan(mine, theirs).identical).toHaveLength(1);
  });

  it('MOD vs DEL → mod-del 충돌', () => {
    const mine = computeNetDelta([d('MOD', 'classes', 'c1', { name: 'Keep' }, { name: 'Base' })]);
    const theirs = computeNetDelta([d('DEL', 'classes', 'c1', null, { name: 'Base' })]);
    const plan = buildMergePlan(mine, theirs);
    expect(plan.conflicts[0].reason).toBe('mod-del');
  });

  it('DEL vs MOD → del-mod 충돌', () => {
    const mine = computeNetDelta([d('DEL', 'classes', 'c1', null, { name: 'Base' })]);
    const theirs = computeNetDelta([d('MOD', 'classes', 'c1', { name: 'Changed' }, { name: 'Base' })]);
    const plan = buildMergePlan(mine, theirs);
    expect(plan.conflicts[0].reason).toBe('del-mod');
  });

  it('DEL vs DEL → identical', () => {
    const mine = computeNetDelta([d('DEL', 'classes', 'c1', null, { name: 'A' })]);
    const theirs = computeNetDelta([d('DEL', 'classes', 'c1', null, { name: 'A' })]);
    const plan = buildMergePlan(mine, theirs);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.identical).toHaveLength(1);
  });

  it('ADD vs ADD(내용 다름, UUIDv5 결정적 id 충돌) → add-add 충돌', () => {
    const mine = computeNetDelta([d('ADD', 'classes', 'c1', { name: 'MineVer' })]);
    const theirs = computeNetDelta([d('ADD', 'classes', 'c1', { name: 'TheirsVer' })]);
    const plan = buildMergePlan(mine, theirs);
    expect(plan.conflicts[0].reason).toBe('add-add');
  });
});

describe('applyResolutions', () => {
  const mine = computeNetDelta([
    d('MOD', 'classes', 'c1', { name: 'Mine' }, { name: 'Base' }),
    d('ADD', 'classes', 'c2', { name: 'NewOne' }),
  ]);
  const theirs = computeNetDelta([
    d('MOD', 'classes', 'c1', { name: 'Theirs' }, { name: 'Base' }),
  ]);
  const plan = buildMergePlan(mine, theirs);

  it('미해소 충돌이 있으면 unresolved 로 보고(부분 병합 금지)', () => {
    const { effective, unresolved } = applyResolutions(plan, []);
    expect(unresolved).toHaveLength(1);
    expect(effective).toHaveLength(1); // autoApply 인 c2 만
  });

  it("choice=mine → 브랜치 변경 적용", () => {
    const { effective, unresolved } = applyResolutions(plan, [
      { key: 'classes:c1', choice: 'mine' },
    ]);
    expect(unresolved).toHaveLength(0);
    expect(effective.map((e) => e.key).sort()).toEqual(['classes:c1', 'classes:c2']);
  });

  it("choice=theirs → main 유지(적용 목록에서 제외)", () => {
    const { effective, unresolved } = applyResolutions(plan, [
      { key: 'classes:c1', choice: 'theirs' },
    ]);
    expect(unresolved).toHaveLength(0);
    expect(effective.map((e) => e.key)).toEqual(['classes:c2']);
  });

  it('mod-del 에서 mine 선택 시 MOD 가 ADD 로 승격(재생성)', () => {
    const m = computeNetDelta([d('MOD', 'classes', 'c9', { name: 'Revive' }, { name: 'Base' })]);
    const t = computeNetDelta([d('DEL', 'classes', 'c9', null, { name: 'Base' })]);
    const p = buildMergePlan(m, t);
    const { effective } = applyResolutions(p, [{ key: 'classes:c9', choice: 'mine' }]);
    expect(effective[0].operation).toBe('ADD');
  });
});

describe('sortForApplication', () => {
  it('생성은 의존 순서(클래스→인스턴스→엣지), 삭제는 역순으로 뒤에', () => {
    const changes = [
      { key: 'edges:e1', operation: 'ADD' as const, targetTable: 'edges', targetId: 'e1', beforeSnapshot: null, afterSnapshot: {} },
      { key: 'classes:c1', operation: 'DEL' as const, targetTable: 'classes', targetId: 'c1', beforeSnapshot: null, afterSnapshot: null },
      { key: 'classes:c2', operation: 'ADD' as const, targetTable: 'classes', targetId: 'c2', beforeSnapshot: null, afterSnapshot: {} },
      { key: 'edges:e2', operation: 'DEL' as const, targetTable: 'edges', targetId: 'e2', beforeSnapshot: null, afterSnapshot: null },
      { key: 'instances:i1', operation: 'ADD' as const, targetTable: 'instances', targetId: 'i1', beforeSnapshot: null, afterSnapshot: {} },
    ];
    const sorted = sortForApplication(changes);
    expect(sorted.map((c) => c.key)).toEqual([
      'classes:c2',
      'instances:i1',
      'edges:e1',
      'edges:e2',
      'classes:c1',
    ]);
  });
});
