import { describe, it, expect } from 'vitest';
import { filterAndSortPatterns, isCatalogQuery } from '../catalog';
import type { Pattern } from '../types';

function p(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: 'x',
    key: 'k',
    name: 'Name',
    nameKo: '이름',
    version: 1,
    domain: 'equipment',
    roles: [],
    relationTypes: [],
    competencyQuestions: [],
    traversalTemplates: [],
    method: 'synthesized',
    sourceRepo: null,
    sourceUri: null,
    sourceLabel: null,
    license: null,
    occurrenceCount: 1,
    visibility: 'org',
    health: null,
    isDraft: false,
    previousVersionId: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('filterAndSortPatterns', () => {
  it('draft 는 제외한다', () => {
    const rows = filterAndSortPatterns([p({ id: 'a' }), p({ id: 'b', isDraft: true })], {});
    expect(rows.map((r) => r.id)).toEqual(['a']);
  });

  it('기본(visibility 미지정)은 private 를 제외하고 공유(org/public)만 반환한다 [보안]', () => {
    const rows = filterAndSortPatterns(
      [
        p({ id: 'priv', visibility: 'private' }),
        p({ id: 'org1', visibility: 'org' }),
        p({ id: 'pub', visibility: 'public' }),
      ],
      {},
    );
    expect(rows.map((r) => r.id).sort()).toEqual(['org1', 'pub']);
  });

  it('visibility=private 을 명시하면 private 를 반환한다(내 패턴 관리)', () => {
    const rows = filterAndSortPatterns([p({ id: 'priv', visibility: 'private' })], {
      visibility: 'private',
    });
    expect(rows.map((r) => r.id)).toEqual(['priv']);
  });

  it('domain·visibility·source·q 로 필터한다', () => {
    const patterns = [
      p({ id: 'match', domain: 'equipment', visibility: 'org', method: 'adapted', nameKo: '장비패턴' }),
      p({ id: 'wrongDomain', domain: 'finance', visibility: 'org', method: 'adapted' }),
      p({ id: 'wrongVis', domain: 'equipment', visibility: 'private', method: 'adapted' }),
      p({ id: 'wrongSource', domain: 'equipment', visibility: 'org', method: 'synthesized' }),
    ];
    const rows = filterAndSortPatterns(patterns, {
      domain: 'equipment',
      visibility: 'org',
      source: 'adapted',
      q: '장비',
    });
    expect(rows.map((r) => r.id)).toEqual(['match']);
  });

  it('q 는 name/nameKo/domain 을 대소문자 무시로 검색한다', () => {
    const rows = filterAndSortPatterns(
      [p({ id: 'a', name: 'FMEA', nameKo: '고장분석', domain: 'diagnostic' })],
      { q: 'fmea' },
    );
    expect(rows).toHaveLength(1);
  });

  it('기본 정렬은 사용빈도 내림차순', () => {
    const rows = filterAndSortPatterns(
      [p({ id: 'low', occurrenceCount: 2 }), p({ id: 'high', occurrenceCount: 9 })],
      {},
    );
    expect(rows.map((r) => r.id)).toEqual(['high', 'low']);
  });

  it('sort=health 는 헬스 내림차순(null 하단)', () => {
    const rows = filterAndSortPatterns(
      [p({ id: 'none', health: null }), p({ id: 'hi', health: 90 }), p({ id: 'mid', health: 40 })],
      { sort: 'health' },
    );
    expect(rows.map((r) => r.id)).toEqual(['hi', 'mid', 'none']);
  });

  it('sort=recent 는 생성일 내림차순', () => {
    const rows = filterAndSortPatterns(
      [
        p({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
        p({ id: 'new', createdAt: '2026-07-01T00:00:00.000Z' }),
      ],
      { sort: 'recent' },
    );
    expect(rows.map((r) => r.id)).toEqual(['new', 'old']);
  });
});

describe('isCatalogQuery', () => {
  it('카탈로그 전용 파라미터가 있으면 true', () => {
    expect(isCatalogQuery({ sort: 'occurrence' })).toBe(true);
    expect(isCatalogQuery({ visibility: 'org' })).toBe(true);
    expect(isCatalogQuery({ q: 'x' })).toBe(true);
    expect(isCatalogQuery({ mode: 'catalog' })).toBe(true);
  });

  it('단독 domain(히트)·빈 쿼리는 false', () => {
    expect(isCatalogQuery({ domain: 'equipment' })).toBe(false);
    expect(isCatalogQuery({})).toBe(false);
  });
});
