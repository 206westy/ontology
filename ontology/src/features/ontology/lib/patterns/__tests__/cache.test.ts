import { describe, it, expect } from 'vitest';
import { selectCachedPattern, nextPatternVersion } from '../cache';
import type { Pattern } from '../types';

function makePattern(over: Partial<Pattern>): Pattern {
  return {
    id: 'id',
    key: 'diagnostic',
    name: 'Diagnostic',
    nameKo: '진단',
    version: 1,
    domain: 'diagnostic',
    roles: [],
    relationTypes: [],
    competencyQuestions: [],
    traversalTemplates: [],
    method: 'synthesized',
    sourceRepo: null,
    sourceUri: null,
    sourceLabel: null,
    license: null,
    isDraft: false,
    previousVersionId: null,
    createdAt: '2026-07-01T00:00:00Z',
    ...over,
  };
}

describe('selectCachedPattern', () => {
  it('returns null for an empty cache (first input works)', () => {
    expect(selectCachedPattern('diagnostic', [])).toBeNull();
  });

  it('returns the cached pattern for a known domain (hit → no re-synthesize)', () => {
    const p = makePattern({ id: 'a' });
    expect(selectCachedPattern('diagnostic', [p])?.id).toBe('a');
  });

  it('picks the highest non-draft version', () => {
    const patterns = [
      makePattern({ id: 'v1', version: 1 }),
      makePattern({ id: 'v3', version: 3 }),
      makePattern({ id: 'v2', version: 2 }),
    ];
    expect(selectCachedPattern('diagnostic', patterns)?.id).toBe('v3');
  });

  it('ignores drafts and other domains', () => {
    const patterns = [
      makePattern({ id: 'draft', version: 9, isDraft: true }),
      makePattern({ id: 'other', domain: 'admin' }),
      makePattern({ id: 'ok', version: 2 }),
    ];
    expect(selectCachedPattern('diagnostic', patterns)?.id).toBe('ok');
  });
});

describe('nextPatternVersion', () => {
  it('starts at 1 for a new key', () => {
    expect(nextPatternVersion('new', [])).toBe(1);
  });

  it('increments past the max version of the same key', () => {
    const patterns = [
      makePattern({ key: 'diagnostic', version: 1 }),
      makePattern({ key: 'diagnostic', version: 4 }),
    ];
    expect(nextPatternVersion('diagnostic', patterns)).toBe(5);
  });
});
