import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  stableEntityId,
  stableEdgeId,
} from '@/features/ontology/lib/identity';

// PRD-F P1-1 수용 기준: 같은 입력 재유입 → 같은 id, MERGE 중복 0.
describe('stableEntityId', () => {
  it('동일 이름·kind·partition 은 항상 같은 id (재유입 고정)', () => {
    const a = stableEntityId('Dry Asher', 'class', 'p1');
    const b = stableEntityId('Dry Asher', 'class', 'p1');
    expect(a).toBe(b);
  });

  it('대소문자·공백·하이픈만 다른 이름은 같은 id (정규화)', () => {
    const a = stableEntityId('Dry Asher', 'class', 'p1');
    const b = stableEntityId('  dry-asher ', 'class', 'p1');
    const c = stableEntityId('DRY_ASHER', 'class', 'p1');
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('다른 kind 는 다른 id', () => {
    const asClass = stableEntityId('Sample', 'class', 'p1');
    const asInstance = stableEntityId('Sample', 'instance', 'p1');
    expect(asClass).not.toBe(asInstance);
  });

  it('다른 partition 은 다른 id', () => {
    const p1 = stableEntityId('Sample', 'class', 'p1');
    const p2 = stableEntityId('Sample', 'class', 'p2');
    expect(p1).not.toBe(p2);
  });

  it('반환값은 유효한 UUID (z.uuid 통과 → DB uuid 컬럼·cypher 호환)', () => {
    const id = stableEntityId('Sample', 'class', 'p1');
    expect(() => z.uuid().parse(id)).not.toThrow();
    // 규격상 v5 여야 함(version nibble = 5).
    expect(() => z.uuid({ version: 'v5' }).parse(id)).not.toThrow();
  });
});

describe('stableEdgeId', () => {
  it('같은 (src,tgt,관계명,category) 은 같은 edge id', () => {
    const a = stableEdgeId('n1', 'n2', 'contains', 'structural');
    const b = stableEdgeId('n1', 'n2', 'Contains', 'structural');
    expect(a).toBe(b);
  });

  it('방향/끝점/관계명/category 가 다르면 다른 edge id', () => {
    const base = stableEdgeId('n1', 'n2', 'contains', 'structural');
    expect(stableEdgeId('n2', 'n1', 'contains', 'structural')).not.toBe(base);
    expect(stableEdgeId('n1', 'n3', 'contains', 'structural')).not.toBe(base);
    expect(stableEdgeId('n1', 'n2', 'causes', 'structural')).not.toBe(base);
    expect(stableEdgeId('n1', 'n2', 'contains', 'causal')).not.toBe(base);
  });

  it('반환값은 유효한 UUID', () => {
    const id = stableEdgeId('n1', 'n2', 'contains', 'structural');
    expect(() => z.uuid().parse(id)).not.toThrow();
  });
});
