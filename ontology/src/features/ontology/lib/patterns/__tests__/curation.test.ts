import { describe, it, expect } from 'vitest';
import { curatePatterns, dimmedIdSet, DEFAULT_CURATION } from '../curation';
import type { Pattern } from '../types';

function p(id: string, overrides: Partial<Pattern> = {}): Pattern {
  return {
    id,
    key: 'k',
    name: id,
    nameKo: id,
    version: 1,
    domain: 'd',
    roles: [],
    relationTypes: [],
    competencyQuestions: [],
    traversalTemplates: [],
    method: 'synthesized',
    sourceRepo: null,
    sourceUri: null,
    sourceLabel: null,
    license: null,
    occurrenceCount: 5,
    health: null,
    isDraft: false,
    previousVersionId: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('curatePatterns', () => {
  it('헬스 임계 미만(발행 패턴)은 dim 처리한다', () => {
    const result = curatePatterns([p('low', { health: 30 })]);
    expect(result[0].dimmed).toBe(true);
  });

  it('헬스 임계 이상은 dim 하지 않는다', () => {
    const result = curatePatterns([p('good', { health: 80 })]);
    expect(result[0].dimmed).toBe(false);
  });

  it('health 미산정(null)은 기본 임계로 dim 하지 않는다(신규 벌하지 않음)', () => {
    const result = curatePatterns([p('new', { health: null })]);
    expect(result[0].dimmed).toBe(false);
  });

  it('dim 된 항목을 하단으로 민다(안정 정렬)', () => {
    const result = curatePatterns([
      p('a', { health: 80 }),
      p('lowbie', { health: 20 }),
      p('b', { health: 90 }),
    ]);
    expect(result.map((r) => r.pattern.id)).toEqual(['a', 'b', 'lowbie']);
    expect(result[2].dimmed).toBe(true);
  });

  it('occurrence 임계는 기본 비활성(신규 패턴 보호)', () => {
    const result = curatePatterns([p('once', { occurrenceCount: 1, health: null })]);
    expect(result[0].dimmed).toBe(false);
  });

  it('occurrence 임계를 켜면 저빈도를 dim 한다', () => {
    const result = curatePatterns([p('once', { occurrenceCount: 1, health: null })], {
      ...DEFAULT_CURATION,
      minOccurrence: 3,
    });
    expect(result[0].dimmed).toBe(true);
  });

  it('dimmedIdSet 은 dim 된 id 만 담는다', () => {
    const curated = curatePatterns([p('a', { health: 80 }), p('low', { health: 10 })]);
    const set = dimmedIdSet(curated);
    expect(set.has('low')).toBe(true);
    expect(set.has('a')).toBe(false);
  });
});
