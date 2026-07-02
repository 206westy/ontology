import { describe, it, expect } from 'vitest';
import { makeGlossaryLookup, buildGlossaryInjectionBlock } from './glossary';
import type { TermGlossaryEntry } from './types';

const entries: TermGlossaryEntry[] = [
  {
    id: '1',
    domain: 'semiconductor-maintenance',
    partitionId: null,
    term: 'VV',
    meaning: '밸브',
    source: 'user',
    confidence: 0.9,
    evidence: '인접 노드 솔레노이드로 확정',
    createdAt: '2026-07-02T00:00:00Z',
  },
  {
    id: '2',
    domain: 'finance',
    partitionId: null,
    term: 'VV',
    meaning: 'Variable Voltage',
    source: 'user',
    confidence: null,
    evidence: null,
    createdAt: '2026-07-02T00:00:00Z',
  },
];

describe('makeGlossaryLookup (domain-scoped)', () => {
  it('returns the meaning for the matching domain (case-insensitive term)', () => {
    const lookup = makeGlossaryLookup(entries);
    const hit = lookup('semiconductor-maintenance', 'vv');
    expect(hit?.meaning).toBe('밸브');
    expect(hit?.source).toBe('internal');
  });

  it('scopes by domain — the same term resolves differently per domain', () => {
    const lookup = makeGlossaryLookup(entries);
    expect(lookup('semiconductor-maintenance', 'VV')?.meaning).toBe('밸브');
    expect(lookup('finance', 'VV')?.meaning).toBe('Variable Voltage');
  });

  it('returns null when domain has no entry (no global force)', () => {
    const lookup = makeGlossaryLookup(entries);
    expect(lookup('logistics', 'VV')).toBeNull();
  });
});

describe('buildGlossaryInjectionBlock (re-injection)', () => {
  it('produces an injectable context block for a domain', () => {
    const block = buildGlossaryInjectionBlock('semiconductor-maintenance', entries);
    expect(block).toContain('VV = 밸브');
    expect(block).not.toContain('Variable Voltage'); // 다른 도메인 제외
  });

  it('returns empty string when the domain has no confirmed terms', () => {
    expect(buildGlossaryInjectionBlock('logistics', entries)).toBe('');
  });
});
