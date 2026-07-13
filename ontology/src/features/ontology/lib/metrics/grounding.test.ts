import { describe, it, expect } from 'vitest';
import {
  computeGrounding,
  computeInstanceRebindDiff,
  STALE_DAYS,
} from './grounding';
import { stableEntityId } from '../identity';

const P = '00000000-0000-0000-0000-000000000001';
const NOW = Date.parse('2026-07-13T00:00:00Z');
const DAY = 86_400_000;

describe('computeGrounding', () => {
  it('바인딩률 = 인스턴스 있는 클래스 비율, 미접지 목록 산출', () => {
    const r = computeGrounding(
      {
        classes: [
          { id: 'a', partitionId: P },
          { id: 'b', partitionId: P },
        ],
        instances: [{ id: 'i1', classId: 'a', updatedAt: '2026-07-13T00:00:00Z' }],
        properties: [],
        instanceValues: [],
      },
      NOW,
    );
    expect(r.totalClasses).toBe(2);
    expect(r.boundClasses).toBe(1);
    expect(r.bindingRate).toBe(0.5);
    expect(r.ungroundedClassIds).toEqual(['b']);
    expect(r.totalInstances).toBe(1);
  });

  it('빈 모델은 vacuous 1(바인딩률·채움률)', () => {
    const r = computeGrounding({ classes: [], instances: [], properties: [], instanceValues: [] }, NOW);
    expect(r.bindingRate).toBe(1);
    expect(r.fillRate).toBe(1);
    expect(r.oldestAgeDays).toBeNull();
  });

  it('채움률 = 채운 값 / (인스턴스 × 클래스 속성), 빈 값·타 클래스 값 제외', () => {
    const r = computeGrounding(
      {
        classes: [{ id: 'a', partitionId: P }],
        instances: [{ id: 'i1', classId: 'a', updatedAt: '2026-07-13T00:00:00Z' }],
        properties: [
          { id: 'p1', classId: 'a' },
          { id: 'p2', classId: 'a' },
        ],
        instanceValues: [
          { instanceId: 'i1', propertyId: 'p1', value: 'x' },
          { instanceId: 'i1', propertyId: 'p2', value: '' }, // 빈 값 → 미채움
        ],
      },
      NOW,
    );
    expect(r.fillRate).toBe(0.5);
  });

  it('신선도 = 구획별 최신 인스턴스 경과일, 임계 초과는 stale', () => {
    const old = new Date(NOW - (STALE_DAYS + 10) * DAY).toISOString();
    const r = computeGrounding(
      {
        classes: [{ id: 'a', partitionId: P }],
        instances: [{ id: 'i1', classId: 'a', updatedAt: old }],
        properties: [],
        instanceValues: [],
      },
      NOW,
    );
    expect(r.freshnessByPartition).toHaveLength(1);
    expect(r.freshnessByPartition[0].ageDays).toBe(STALE_DAYS + 10);
    expect(r.stalePartitionIds).toEqual([P]);
    expect(r.oldestAgeDays).toBe(STALE_DAYS + 10);
  });

  it('최근 데이터는 stale 아님', () => {
    const recent = new Date(NOW - 5 * DAY).toISOString();
    const r = computeGrounding(
      {
        classes: [{ id: 'a', partitionId: P }],
        instances: [{ id: 'i1', classId: 'a', updatedAt: recent }],
        properties: [],
        instanceValues: [],
      },
      NOW,
    );
    expect(r.stalePartitionIds).toEqual([]);
    expect(r.freshnessByPartition[0].ageDays).toBe(5);
  });
});

describe('computeInstanceRebindDiff', () => {
  it('같은 CSV 재업로드 → 기존은 갱신, 새 이름은 신규(중복 방지)', () => {
    const existing = [
      { id: stableEntityId('Pump447', 'instance', P), classId: 'c-eq', name: 'Pump447' },
    ];
    const diff = computeInstanceRebindDiff(
      existing,
      [
        { name: 'Pump447', className: 'Equipment' },
        { name: 'Pump999', className: 'Equipment' },
      ],
      { Equipment: 'c-eq' },
      P,
    );
    expect(diff.updated).toEqual(['Pump447']);
    expect(diff.created).toEqual(['Pump999']);
    expect(diff.missing).toEqual([]);
  });

  it('새 CSV에 없는 기존 인스턴스는 소실로 표시(자동삭제 X)', () => {
    const existing = [
      { id: stableEntityId('Pump447', 'instance', P), classId: 'c-eq', name: 'Pump447' },
      { id: stableEntityId('OldPump', 'instance', P), classId: 'c-eq', name: 'OldPump' },
    ];
    const diff = computeInstanceRebindDiff(
      existing,
      [{ name: 'Pump447', className: 'Equipment' }],
      { Equipment: 'c-eq' },
      P,
    );
    expect(diff.updated).toEqual(['Pump447']);
    expect(diff.missing.map((m) => m.name)).toEqual(['OldPump']);
  });
});
