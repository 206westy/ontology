import { describe, it, expect } from 'vitest';
import { findStructureIssues } from '@/features/ontology/lib/graph-health';
import type { OntologyEdge } from '@/features/ontology/lib/types';

function edge(partial: Partial<OntologyEdge> & { id: string; sourceId: string; targetId: string; relationTypeId: string }): OntologyEdge {
  return {
    sourceKind: 'class',
    targetKind: 'class',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  } as OntologyEdge;
}

const nodeName = (id: string) => id.toUpperCase();
const relName = (rt: string) => rt;

describe('findStructureIssues', () => {
  it('정상 그래프는 결함이 없다', () => {
    const edges = [
      edge({ id: 'e1', sourceId: 'a', targetId: 'b', relationTypeId: 'r1' }),
      edge({ id: 'e2', sourceId: 'b', targetId: 'c', relationTypeId: 'r1' }),
    ];
    expect(findStructureIssues(edges, nodeName, relName)).toHaveLength(0);
  });

  it('자기 루프를 탐지한다', () => {
    const edges = [edge({ id: 'e1', sourceId: 'a', targetId: 'a', relationTypeId: 'r1' })];
    const issues = findStructureIssues(edges, nodeName, relName);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('self_loop');
    expect(issues[0].edgeId).toBe('e1');
  });

  it('중복 엣지(동일 relation·source·target)의 2번째를 탐지한다', () => {
    const edges = [
      edge({ id: 'e1', sourceId: 'a', targetId: 'b', relationTypeId: 'r1' }),
      edge({ id: 'e2', sourceId: 'a', targetId: 'b', relationTypeId: 'r1' }),
    ];
    const issues = findStructureIssues(edges, nodeName, relName);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('duplicate_edge');
    expect(issues[0].edgeId).toBe('e2'); // 첫 번째는 보존, 두 번째가 결함
  });

  it('관계 타입이 다르면 중복이 아니다', () => {
    const edges = [
      edge({ id: 'e1', sourceId: 'a', targetId: 'b', relationTypeId: 'r1' }),
      edge({ id: 'e2', sourceId: 'a', targetId: 'b', relationTypeId: 'r2' }),
    ];
    expect(findStructureIssues(edges, nodeName, relName)).toHaveLength(0);
  });
});
