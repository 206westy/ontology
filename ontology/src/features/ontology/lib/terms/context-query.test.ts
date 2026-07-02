import { describe, it, expect } from 'vitest';
import {
  buildContextQuery,
  buildInjectedContextLines,
  type ContextQueryInput,
} from './context-query';

const input: ContextQueryInput = {
  term: 'VV',
  domain: 'semiconductor-maintenance',
  domainKo: '반도체 설비 유지보수',
  adjacentNodes: ['솔레노이드', '에어 실린더', '레귤레이터'],
  candidateType: '부품',
};

describe('buildContextQuery (context-injected, never bare keyword)', () => {
  it('injects domain + adjacent nodes + candidate type', () => {
    const query = buildContextQuery(input);
    expect(query).toContain('반도체 설비 유지보수');
    expect(query).toContain('솔레노이드');
    expect(query).toContain('부품');
    expect(query).toContain('VV');
  });

  it('is NOT a bare keyword', () => {
    const query = buildContextQuery(input);
    expect(query).not.toBe('VV');
    expect(query.length).toBeGreaterThan('VV'.length + 10);
  });

  it('still injects domain + adjacent when candidate type is absent', () => {
    const query = buildContextQuery({ ...input, candidateType: null });
    expect(query).toContain('반도체 설비 유지보수');
    expect(query).toContain('솔레노이드');
    expect(query).not.toBe('VV');
  });

  it('caps adjacent nodes to avoid query bloat', () => {
    const many = Array.from({ length: 20 }, (_, i) => `노드${i}`);
    const query = buildContextQuery({ ...input, adjacentNodes: many });
    expect(query).toContain('노드0');
    expect(query).not.toContain('노드19');
  });
});

describe('buildInjectedContextLines (H8-e transparency)', () => {
  it('lists what was injected to pick the meaning', () => {
    const lines = buildInjectedContextLines(input);
    expect(lines.some((l) => l.includes('반도체 설비 유지보수'))).toBe(true);
    expect(lines.some((l) => l.includes('부품'))).toBe(true);
    expect(lines.some((l) => l.includes('솔레노이드'))).toBe(true);
  });
});
