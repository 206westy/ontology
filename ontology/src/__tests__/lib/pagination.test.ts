import { describe, it, expect } from 'vitest';
import { parsePagination, MAX_PAGE_LIMIT } from '@/lib/pagination';

function params(obj: Record<string, string>) {
  return new URLSearchParams(obj);
}

// H6: pagination is opt-in. No params → full load (undefined limit/offset),
// so the existing whole-graph load is never silently truncated.
describe('parsePagination', () => {
  it('returns undefined for both when no params given (full load preserved)', () => {
    expect(parsePagination(params({}))).toEqual({
      limit: undefined,
      offset: undefined,
    });
  });

  it('parses valid limit and offset', () => {
    expect(parsePagination(params({ limit: '50', offset: '100' }))).toEqual({
      limit: 50,
      offset: 100,
    });
  });

  it('caps limit at MAX_PAGE_LIMIT', () => {
    expect(parsePagination(params({ limit: '99999' })).limit).toBe(MAX_PAGE_LIMIT);
  });

  it('ignores invalid or non-positive values', () => {
    expect(parsePagination(params({ limit: 'abc', offset: '-5' }))).toEqual({
      limit: undefined,
      offset: undefined,
    });
    expect(parsePagination(params({ limit: '0' })).limit).toBeUndefined();
  });
});
