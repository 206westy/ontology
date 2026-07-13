import { describe, it, expect } from 'vitest';
import {
  summarizeLineage,
  computePublishVersion,
  summarizeChangesByPartition,
  type LineageEvent,
} from './lineage';

const ev = (o: Partial<LineageEvent> & { operation: LineageEvent['operation']; createdAt: string }): LineageEvent => ({
  message: '',
  authorEmail: null,
  pushedAt: null,
  versionTag: null,
  ...o,
});

describe('summarizeLineage', () => {
  it('빈 이벤트는 모두 null/0', () => {
    const s = summarizeLineage([]);
    expect(s.createdAt).toBeNull();
    expect(s.totalEvents).toBe(0);
  });

  it('생성(첫 ADD)·변경 수·최근 발행을 요약(입력 순서 무관)', () => {
    const events: LineageEvent[] = [
      ev({ operation: 'MOD', createdAt: '2026-07-10T00:00:00Z' }),
      ev({ operation: 'ADD', createdAt: '2026-07-08T00:00:00Z', authorEmail: 'a@x.com' }),
      ev({ operation: 'MOD', createdAt: '2026-07-12T00:00:00Z', pushedAt: '2026-07-12T01:00:00Z', versionTag: 'v1.3' }),
    ];
    const s = summarizeLineage(events);
    expect(s.createdAt).toBe('2026-07-08T00:00:00Z');
    expect(s.createdBy).toBe('a@x.com');
    expect(s.changeCount).toBe(2);
    expect(s.lastChangedAt).toBe('2026-07-12T00:00:00Z');
    expect(s.publishedAt).toBe('2026-07-12T01:00:00Z');
    expect(s.versionTag).toBe('v1.3');
  });

  it('미발행 노드는 publishedAt/versionTag null', () => {
    const s = summarizeLineage([ev({ operation: 'ADD', createdAt: '2026-07-08T00:00:00Z' })]);
    expect(s.publishedAt).toBeNull();
    expect(s.versionTag).toBeNull();
  });
});

describe('computePublishVersion', () => {
  it('이전 발행 수 기반 단조 태그', () => {
    expect(computePublishVersion(0)).toBe('v1.1');
    expect(computePublishVersion(4)).toBe('v1.5');
  });
  it('음수/소수는 안전 처리', () => {
    expect(computePublishVersion(-3)).toBe('v1.1');
    expect(computePublishVersion(2.9)).toBe('v1.3');
  });
});

describe('summarizeChangesByPartition', () => {
  it('클래스는 partitionId 로, 그 외는 기타 버킷으로 집계', () => {
    const s = summarizeChangesByPartition([
      { operation: 'ADD', targetTable: 'classes', afterSnapshot: { partitionId: 'P1' } },
      { operation: 'MOD', targetTable: 'classes', afterSnapshot: { partitionId: 'P1' } },
      { operation: 'ADD', targetTable: 'classes', afterSnapshot: { partitionId: 'P2' } },
      { operation: 'ADD', targetTable: 'instances', afterSnapshot: { classId: 'c1' } },
      { operation: 'DEL', targetTable: 'edges', beforeSnapshot: {} },
    ]);
    const p1 = s.byPartition.find((b) => b.partitionId === 'P1');
    expect(p1).toEqual({ partitionId: 'P1', added: 1, modified: 1, deleted: 0 });
    const other = s.byPartition.find((b) => b.partitionId === '기타');
    expect(other).toEqual({ partitionId: '기타', added: 1, modified: 0, deleted: 1 });
    expect(s.totals).toEqual({ added: 3, modified: 1, deleted: 1 });
  });

  it('partitionId 없는 클래스 스냅샷은 (미지정)', () => {
    const s = summarizeChangesByPartition([
      { operation: 'ADD', targetTable: 'classes', afterSnapshot: {} },
    ]);
    expect(s.byPartition[0].partitionId).toBe('(미지정)');
  });
});
