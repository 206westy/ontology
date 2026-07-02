import { describe, it, expect } from 'vitest';
import {
  mergeRelationsAcrossChunks,
  relationKey,
} from '@/features/ontology/lib/relation-merge';
import type { ParsedRelation } from '@/features/ontology/lib/schemas';

const rel = (over: Partial<ParsedRelation>): ParsedRelation => ({
  source: 'A',
  target: 'B',
  type: 'contains',
  category: 'structural',
  evidence: '',
  confidence: 0.5,
  categoryConfidence: 0.8,
  ...over,
});

describe('relationKey', () => {
  it('정규화된 (source,target,type,category) 로 키 생성', () => {
    expect(relationKey(rel({ type: 'Contains' }))).toBe(
      relationKey(rel({ type: 'contains' })),
    );
  });
});

describe('mergeRelationsAcrossChunks', () => {
  it('동일 관계는 1건으로 dedup, confidence 는 최댓값', () => {
    const { merged, dedupedCount } = mergeRelationsAcrossChunks([
      rel({ confidence: 0.6, evidence: 'x' }),
      rel({ confidence: 0.9, evidence: 'more evidence text' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(dedupedCount).toBe(1);
    expect(merged[0].confidence).toBe(0.9);
    expect(merged[0].evidence).toBe('more evidence text'); // 더 긴 스팬 유지
  });

  it('category 가 다르면 별개 관계로 보존', () => {
    const { merged } = mergeRelationsAcrossChunks([
      rel({ category: 'structural' }),
      rel({ category: 'causal' }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('방향/끝점이 다르면 별개', () => {
    const { merged } = mergeRelationsAcrossChunks([
      rel({ source: 'A', target: 'B' }),
      rel({ source: 'B', target: 'A' }),
    ]);
    expect(merged).toHaveLength(2);
  });
});
