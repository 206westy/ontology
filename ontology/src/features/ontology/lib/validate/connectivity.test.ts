import { describe, it, expect } from 'vitest';
import { analyzeConnectivity } from './connectivity';

describe('analyzeConnectivity (H7 연결성)', () => {
  it('빈 그래프는 단일 연결(vacuous)로 본다', () => {
    const r = analyzeConnectivity([], []);
    expect(r.componentCount).toBe(0);
    expect(r.isConnected).toBe(true);
    expect(r.warning).toBeNull();
  });

  it('병합 전(두 조각) 그래프는 "N개로 분리" 경고를 낸다', () => {
    // 조각 A: a-b, 조각 B: c-d — 서로 연결 없음.
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const edges = [
      { sourceId: 'a', targetId: 'b' },
      { sourceId: 'c', targetId: 'd' },
    ];
    const r = analyzeConnectivity(nodes, edges);
    expect(r.componentCount).toBe(2);
    expect(r.isConnected).toBe(false);
    expect(r.warning).toContain('2개로 분리');
  });

  it('단일 연결 그래프는 1개 컴포넌트로 보고하고 경고가 없다', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const edges = [
      { sourceId: 'a', targetId: 'b' },
      { sourceId: 'b', targetId: 'c' },
    ];
    const r = analyzeConnectivity(nodes, edges);
    expect(r.componentCount).toBe(1);
    expect(r.isConnected).toBe(true);
    expect(r.warning).toBeNull();
  });

  it('인스턴스까지 고아 탐지를 확장한다(관계 없는 노드)', () => {
    // inst-x 는 어떤 엣지에도 없다 → 고아. 종류 구분 없이 노드로 취급.
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'inst-x' }];
    const edges = [{ sourceId: 'a', targetId: 'b' }];
    const r = analyzeConnectivity(nodes, edges);
    expect(r.isolatedIds).toContain('inst-x');
    expect(r.isolatedIds).not.toContain('a');
    // 고립 노드는 별도 컴포넌트 → 총 2개.
    expect(r.componentCount).toBe(2);
  });

  it('엣지 끝점이 노드 목록에 없어도 컴포넌트로 포함한다', () => {
    const r = analyzeConnectivity([{ id: 'a' }], [
      { sourceId: 'a', targetId: 'ghost' },
    ]);
    expect(r.componentCount).toBe(1);
    expect(r.nodeCount).toBe(2);
    expect(r.isolatedIds).toHaveLength(0);
  });
});
