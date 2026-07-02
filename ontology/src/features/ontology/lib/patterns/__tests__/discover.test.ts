import { describe, it, expect, vi } from 'vitest';
import { discover, type DiscoverDeps } from '../discover';
import type { DiscoverContext, OntologySource, RetrievedSeed } from '../discovery/provider';
import type { PatternBundle } from '../types';

const ctx: DiscoverContext = {
  domain: 'diagnostic',
  domainKo: '진단',
  text: '증상과 원인 노트',
  competencyQuestions: ['증상 X의 원인은?'],
};

const bundle: PatternBundle = {
  name: 'Diagnostic',
  nameKo: '진단',
  roles: [],
  relationTypes: [],
  competencyQuestions: [],
  traversalTemplates: [],
};

function makeSource(name: string, seeds: RetrievedSeed[]): OntologySource {
  return { name, search: vi.fn().mockResolvedValue(seeds) };
}

describe('discover (retrieve › adapt › synthesize)', () => {
  it('adapts when a source returns a seed, carrying source metadata', async () => {
    const seed: RetrievedSeed = {
      label: 'ssn — Semantic Sensor Network',
      repo: 'LOV',
      uri: 'http://www.w3.org/ns/ssn/',
      license: null,
      score: 0.9,
      summary: 'sensor ontology',
    };
    const adaptFn = vi.fn().mockResolvedValue(bundle);
    const synthesizeFn = vi.fn().mockResolvedValue(bundle);
    const deps: DiscoverDeps = {
      sources: [makeSource('LOV', [seed])],
      adaptFn,
      synthesizeFn,
    };

    const result = await discover(ctx, deps);

    expect(result.method).toBe('adapted');
    expect(result.source).toEqual({
      repo: 'LOV',
      uri: 'http://www.w3.org/ns/ssn/',
      label: 'ssn — Semantic Sensor Network',
      license: null,
    });
    expect(adaptFn).toHaveBeenCalledOnce();
    expect(synthesizeFn).not.toHaveBeenCalled();
  });

  it('picks the highest-scoring seed across sources', async () => {
    const low: RetrievedSeed = { label: 'low', repo: 'LOV', uri: null, license: null, score: 0.2, summary: '' };
    const high: RetrievedSeed = { label: 'high', repo: 'LOV', uri: null, license: 'CC0', score: 0.8, summary: '' };
    const adaptFn = vi.fn().mockResolvedValue(bundle);
    const deps: DiscoverDeps = {
      sources: [makeSource('a', [low]), makeSource('b', [high])],
      adaptFn,
      synthesizeFn: vi.fn().mockResolvedValue(bundle),
    };

    const result = await discover(ctx, deps);

    expect(result.source?.label).toBe('high');
    expect(result.source?.license).toBe('CC0');
  });

  it('synthesizes when no source returns a seed (source null)', async () => {
    const adaptFn = vi.fn().mockResolvedValue(bundle);
    const synthesizeFn = vi.fn().mockResolvedValue(bundle);
    const deps: DiscoverDeps = {
      sources: [makeSource('LOV', [])],
      adaptFn,
      synthesizeFn,
    };

    const result = await discover(ctx, deps);

    expect(result.method).toBe('synthesized');
    expect(result.source).toBeNull();
    expect(synthesizeFn).toHaveBeenCalledOnce();
    expect(adaptFn).not.toHaveBeenCalled();
  });
});
