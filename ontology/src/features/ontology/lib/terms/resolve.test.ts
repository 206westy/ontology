import { describe, it, expect, vi } from 'vitest';
import { resolveTerm, resolveTerms, type ResolveDeps, type ResolveTermsOptions } from './resolve';
import { makeGlossaryLookup } from './glossary';
import type { TermCandidate, TermGlossaryEntry } from './types';

const options: ResolveTermsOptions = {
  domain: 'semiconductor-maintenance',
  domainKo: '반도체 설비 유지보수',
  adjacentNodes: ['솔레노이드', '에어 실린더'],
  candidateType: '부품',
  allowWeb: false,
};

const contextCandidate: TermCandidate = {
  term: 'VV',
  meaning: '밸브',
  confidence: 0.92,
  source: 'context',
  rationale: '인접 노드(솔레노이드·에어 실린더)로 보아 유체 제어 부품',
};

function baseDeps(overrides: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    glossaryLookup: vi.fn().mockReturnValue(null),
    contextResolveFn: vi.fn().mockResolvedValue([contextCandidate]),
    ...overrides,
  };
}

describe('resolveTerm (order: internal → context → web)', () => {
  it('yields a "밸브" candidate from a domain+context-injected query', async () => {
    const resolution = await resolveTerm('VV', options, baseDeps());
    expect(resolution.candidates.map((c) => c.meaning)).toContain('밸브');
    // 맥락 주입 질의가 투명하게 노출된다(도메인·인접 포함, 키워드 단독 아님).
    expect(resolution.contextInjected).toContain('반도체 설비 유지보수');
    expect(resolution.contextInjected).toContain('솔레노이드');
    expect(resolution.contextInjected).not.toBe('VV');
  });

  it('ranks the internal glossary hit above context candidates', async () => {
    const internal: TermCandidate = {
      term: 'VV',
      meaning: '밸브(확정)',
      confidence: 0.5,
      source: 'internal',
      rationale: '내부 용어집',
    };
    const deps = baseDeps({ glossaryLookup: vi.fn().mockReturnValue(internal) });
    const resolution = await resolveTerm('VV', options, deps);
    expect(resolution.candidates[0].source).toBe('internal');
    expect(resolution.candidates[0].meaning).toBe('밸브(확정)');
  });

  it('does NOT call web when allowWeb is false', async () => {
    const webResolveFn = vi.fn().mockResolvedValue([]);
    const deps = baseDeps({ webResolveFn });
    await resolveTerm('VV', { ...options, allowWeb: false }, deps);
    expect(webResolveFn).not.toHaveBeenCalled();
  });

  it('calls web with a context-injected query (not a bare keyword) when allowWeb is true', async () => {
    const webCandidate: TermCandidate = {
      term: 'VV',
      meaning: '밸브(웹)',
      confidence: 0.6,
      source: 'web',
      rationale: '웹 스니펫',
    };
    const webResolveFn = vi.fn().mockResolvedValue([webCandidate]);
    const deps = baseDeps({ webResolveFn });
    const resolution = await resolveTerm('VV', { ...options, allowWeb: true }, deps);

    expect(webResolveFn).toHaveBeenCalledOnce();
    const [queryArg] = webResolveFn.mock.calls[0];
    expect(queryArg).toContain('반도체 설비 유지보수');
    expect(queryArg).toContain('솔레노이드');
    expect(queryArg).not.toBe('VV');
    // 웹 후보도 포함되지만 내부/맥락보다 낮은 랭크.
    expect(resolution.candidates.some((c) => c.source === 'web')).toBe(true);
  });
});

describe('domain-scope (glossary-backed lookup)', () => {
  const entries: TermGlossaryEntry[] = [
    {
      id: '1',
      domain: 'semiconductor-maintenance',
      partitionId: null,
      term: 'VV',
      meaning: '밸브',
      source: 'user',
      confidence: 0.9,
      evidence: null,
      createdAt: '2026-07-02T00:00:00Z',
    },
  ];

  it('adopts the prior meaning within the SAME domain', async () => {
    const deps = baseDeps({ glossaryLookup: makeGlossaryLookup(entries) });
    const resolution = await resolveTerm('VV', options, deps);
    expect(resolution.candidates[0].meaning).toBe('밸브');
    expect(resolution.candidates[0].source).toBe('internal');
  });

  it('does NOT force the prior meaning in a DIFFERENT domain', async () => {
    const deps = baseDeps({ glossaryLookup: makeGlossaryLookup(entries) });
    const otherDomain = { ...options, domain: 'finance', domainKo: '재무' };
    const resolution = await resolveTerm('VV', otherDomain, deps);
    // 내부 히트 없음 → 맥락 후보만(밸브를 전역 강제하지 않음).
    expect(resolution.candidates.every((c) => c.source !== 'internal')).toBe(true);
  });
});

describe('resolveTerms (batch)', () => {
  it('resolves each term and preserves order', async () => {
    const deps = baseDeps();
    const resolutions = await resolveTerms(['VV', 'EMO'], options, deps);
    expect(resolutions.map((r) => r.term)).toEqual(['VV', 'EMO']);
  });
});
