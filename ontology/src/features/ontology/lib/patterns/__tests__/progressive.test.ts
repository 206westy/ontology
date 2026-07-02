import { describe, it, expect } from 'vitest';
import {
  scheduleInsertion,
  type InsertNode,
  type InsertEdge,
  type InsertionBatch,
} from '../progressive';

const nodes: InsertNode[] = [
  { id: 'c-root', kind: 'class', parentId: null },
  { id: 'c-child', kind: 'class', parentId: 'c-root' },
  { id: 'i-1', kind: 'instance', parentId: 'c-child' },
  { id: 'i-2', kind: 'instance', parentId: 'c-root' },
];
const edges: InsertEdge[] = [
  { id: 'e-1', sourceId: 'i-1', targetId: 'i-2' },
];

// 배치 인덱스에서 특정 노드/엣지 id 가 처음 등장하는 위치.
function batchIndexOfNode(batches: InsertionBatch[], id: string): number {
  return batches.findIndex((b) => b.kind === 'nodes' && b.nodes.some((n) => n.id === id));
}
function batchIndexOfEdge(batches: InsertionBatch[], id: string): number {
  return batches.findIndex((b) => b.kind === 'edges' && b.edges.some((e) => e.id === id));
}

describe('scheduleInsertion (H3/M2 progressive render)', () => {
  it('places classes before instances', () => {
    const batches = scheduleInsertion(nodes, edges, 2);
    const lastClass = Math.max(batchIndexOfNode(batches, 'c-root'), batchIndexOfNode(batches, 'c-child'));
    const firstInstance = Math.min(batchIndexOfNode(batches, 'i-1'), batchIndexOfNode(batches, 'i-2'));
    expect(lastClass).toBeLessThanOrEqual(firstInstance);
  });

  it('places a child class no earlier than its parent class', () => {
    const batches = scheduleInsertion(nodes, edges, 1);
    expect(batchIndexOfNode(batches, 'c-child')).toBeGreaterThanOrEqual(
      batchIndexOfNode(batches, 'c-root'),
    );
  });

  it('schedules an edge only after both endpoints appear (never dangles)', () => {
    const batches = scheduleInsertion(nodes, edges, 2);
    const edgeIdx = batchIndexOfEdge(batches, 'e-1');
    expect(edgeIdx).toBeGreaterThan(batchIndexOfNode(batches, 'i-1'));
    expect(edgeIdx).toBeGreaterThan(batchIndexOfNode(batches, 'i-2'));
  });

  it('drops edges whose endpoints are missing (dangling prevention)', () => {
    const dangling: InsertEdge[] = [{ id: 'e-x', sourceId: 'i-1', targetId: 'ghost' }];
    const batches = scheduleInsertion(nodes, dangling, 5);
    expect(batchIndexOfEdge(batches, 'e-x')).toBe(-1);
  });

  it('respects batchSize (no batch exceeds it)', () => {
    const batches = scheduleInsertion(nodes, edges, 2);
    for (const b of batches) {
      const len = b.kind === 'nodes' ? b.nodes.length : b.edges.length;
      expect(len).toBeLessThanOrEqual(2);
    }
  });

  it('all node batches come before all edge batches', () => {
    const batches = scheduleInsertion(nodes, edges, 1);
    const firstEdge = batches.findIndex((b) => b.kind === 'edges');
    const lastNode = batches.map((b) => b.kind).lastIndexOf('nodes');
    expect(lastNode).toBeLessThan(firstEdge);
  });
});
