import { describe, it, expect } from 'vitest';
import { selectPartitionsToRebuild } from '@/lib/summary/dirty';

const parts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('selectPartitionsToRebuild (dirty-only 게이팅)', () => {
  it('요약 없음 또는 stale 만 재요약 대상', () => {
    const summaries = [
      { partitionId: 'a', stale: false }, // fresh → 제외
      { partitionId: 'b', stale: true }, // dirty → 포함
      // c: 요약 없음 → 포함
    ];
    expect(selectPartitionsToRebuild(parts, summaries).sort()).toEqual(['b', 'c']);
  });

  it('전부 fresh 면 재계산 0(비용 계약)', () => {
    const summaries = parts.map((p) => ({ partitionId: p.id, stale: false }));
    expect(selectPartitionsToRebuild(parts, summaries)).toEqual([]);
  });

  it('force 면 전량', () => {
    const summaries = parts.map((p) => ({ partitionId: p.id, stale: false }));
    expect(selectPartitionsToRebuild(parts, summaries, { force: true }).sort()).toEqual(['a', 'b', 'c']);
  });
});
