import { describe, it, expect } from 'vitest';
import {
  mergeEntitiesAcrossChunks,
  cosineSimilarity,
  findEmbeddingMergeCandidates,
  entityKey,
} from '@/features/ontology/lib/entity-merge';
import type { ParsedEntity } from '@/features/ontology/lib/schemas';

const ent = (over: Partial<ParsedEntity>): ParsedEntity => ({
  name: 'X',
  type: 'Thing',
  nodeKind: 'class',
  parentType: null,
  evidence: '',
  description: null,
  properties: [],
  ...over,
});

describe('mergeEntitiesAcrossChunks', () => {
  it('청크 경계 동일 개념(정규화 이름+kind)은 단일 entity로 병합', () => {
    const a = ent({ name: 'Dry Asher', description: null });
    const b = ent({ name: ' dry-asher ', description: '건식 애셔' });
    const { merged, mergedCount } = mergeEntitiesAcrossChunks([a, b]);
    expect(merged).toHaveLength(1);
    expect(mergedCount).toBe(1);
    // 더 풍부한(description 있는) 쪽 정보 유지.
    expect(merged[0].description).toBe('건식 애셔');
  });

  it('kind 가 다르면 병합하지 않음', () => {
    const a = ent({ name: 'Sample', nodeKind: 'class' });
    const b = ent({ name: 'Sample', nodeKind: 'instance' });
    const { merged } = mergeEntitiesAcrossChunks([a, b]);
    expect(merged).toHaveLength(2);
  });

  it('properties 는 이름 기준 합집합', () => {
    const a = ent({
      name: 'Chamber',
      properties: [{ name: 'temp', value: '25', dataType: 'integer', enumValues: null }],
    });
    const b = ent({
      name: 'chamber',
      properties: [{ name: 'pressure', value: '1', dataType: 'integer', enumValues: null }],
    });
    const { merged } = mergeEntitiesAcrossChunks([a, b]);
    expect(merged[0].properties.map((p) => p.name).sort()).toEqual(['pressure', 'temp']);
  });
});

describe('cosineSimilarity', () => {
  it('동일 벡터=1, 직교=0, 길이 불일치=0', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
    expect(cosineSimilarity([1, 0], [1])).toBe(0);
  });
});

describe('findEmbeddingMergeCandidates', () => {
  it('임베딩 근접(다른 키)만 후보로, 자동 병합 아님', () => {
    const entities = [ent({ name: 'Asher' }), ent({ name: 'Etcher' })];
    const embeddings = [
      [1, 0, 0],
      [0.99, 0.14, 0],
    ];
    const cands = findEmbeddingMergeCandidates(entities, embeddings, 0.9);
    expect(cands).toHaveLength(1);
    expect(cands[0].a).toBe('Asher');
    // 병합은 호출부가 하지 않는다 — 후보 리스트만 반환.
    expect(entityKey(entities[0])).not.toBe(entityKey(entities[1]));
  });

  it('임계 미만이면 후보 없음', () => {
    const entities = [ent({ name: 'A' }), ent({ name: 'B' })];
    const embeddings = [
      [1, 0],
      [0, 1],
    ];
    expect(findEmbeddingMergeCandidates(entities, embeddings, 0.9)).toHaveLength(0);
  });
});
