import { describe, it, expect } from 'vitest';
import { toRelationLayer } from '@/features/ontology/lib/types';

// PRD-L M2: 과거 category(5분류) → layer(2레이어) 하위호환 매핑 리더.
describe('toRelationLayer', () => {
  it('진단·절차 category 는 kinetic 으로 매핑', () => {
    expect(toRelationLayer('diagnostic')).toBe('kinetic');
    expect(toRelationLayer('procedural')).toBe('kinetic');
  });

  it('구조·인과·서술 category 는 semantic 으로 매핑', () => {
    expect(toRelationLayer('structural')).toBe('semantic');
    expect(toRelationLayer('causal')).toBe('semantic');
    expect(toRelationLayer('descriptive')).toBe('semantic');
  });

  it('이미 layer 값이면 그대로 통과', () => {
    expect(toRelationLayer('semantic')).toBe('semantic');
    expect(toRelationLayer('kinetic')).toBe('kinetic');
  });

  it('알 수 없거나 누락된 값은 semantic 기본', () => {
    expect(toRelationLayer(null)).toBe('semantic');
    expect(toRelationLayer(undefined)).toBe('semantic');
    expect(toRelationLayer('bogus')).toBe('semantic');
  });
});
