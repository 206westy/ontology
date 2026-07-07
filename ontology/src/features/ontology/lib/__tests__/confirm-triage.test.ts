import { describe, it, expect } from 'vitest';
import {
  TRIAGE_CONFIDENCE_MIN,
  triageItem,
  buildTriage,
  criticSeverityByName,
  classSelKey,
  instSelKey,
  relSelKey,
} from '../confirm-triage';
import type { CriticIssue } from '../critic/review';
import type { ParsedExtraction } from '../parse-mapping';

const issue = (over: Partial<CriticIssue>): CriticIssue => ({
  kind: 'duplicate_existing',
  severity: 'med',
  targetName: 'X',
  reason: 'r',
  ruleId: 'rule',
  ...over,
});

describe('triageItem (PRD-L M5)', () => {
  it('is auto when there are no low-confidence signals', () => {
    expect(triageItem({}).verdict).toBe('auto');
    expect(triageItem({ confidence: 0.9 }).verdict).toBe('auto');
    expect(triageItem({ confidence: 0.9 }).reasons).toEqual([]);
  });

  it('treats 0.7 (the boundary) as high-confidence — auto', () => {
    expect(TRIAGE_CONFIDENCE_MIN).toBe(0.7);
    const outcome = triageItem({ confidence: 0.7 });
    expect(outcome.verdict).toBe('auto');
    expect(outcome.reasons).not.toContain('low_confidence');
  });

  it('flags confidence strictly below the boundary as review', () => {
    const outcome = triageItem({ confidence: 0.69 });
    expect(outcome.verdict).toBe('review');
    expect(outcome.reasons).toContain('low_confidence');
  });

  it('ignores confidence when it is null/undefined (entities have none)', () => {
    expect(triageItem({ confidence: null }).verdict).toBe('auto');
    expect(triageItem({ confidence: undefined }).verdict).toBe('auto');
  });

  it('flags a high-severity Critic issue as review', () => {
    expect(triageItem({ criticSeverities: ['high'] }).verdict).toBe('review');
  });

  it('flags a medium-severity Critic issue as review', () => {
    expect(triageItem({ criticSeverities: ['med'] }).verdict).toBe('review');
  });

  it('does NOT flag a low-severity Critic issue (honest islands stay auto)', () => {
    const outcome = triageItem({ criticSeverities: ['low'] });
    expect(outcome.verdict).toBe('auto');
    expect(outcome.reasons).toEqual([]);
  });

  it('flags an unresolved relation endpoint as review', () => {
    const outcome = triageItem({ hasUnresolvedEndpoint: true });
    expect(outcome.verdict).toBe('review');
    expect(outcome.reasons).toContain('unresolved');
  });

  it('accumulates every applicable reason', () => {
    const outcome = triageItem({
      confidence: 0.2,
      criticSeverities: ['low', 'high'],
      hasUnresolvedEndpoint: true,
    });
    expect(outcome.verdict).toBe('review');
    expect(outcome.reasons).toEqual(['low_confidence', 'critic', 'unresolved']);
  });
});

describe('criticSeverityByName', () => {
  it('indexes both targetName and relatedName', () => {
    const map = criticSeverityByName([
      issue({ targetName: 'A', relatedName: 'B', severity: 'high' }),
    ]);
    expect(map.get('A')).toEqual(['high']);
    expect(map.get('B')).toEqual(['high']);
  });
});

function emptyParsed(over: Partial<ParsedExtraction> = {}): ParsedExtraction {
  return { classes: [], properties: [], relations: [], instances: [], warnings: [], ...over };
}

describe('buildTriage (PRD-L M5)', () => {
  it('splits new classes into auto vs review by Critic issues', () => {
    const parsed = emptyParsed({
      classes: [
        { name: 'Clean', description: '', color: null, parentName: null },
        { name: 'Dupe', description: '', color: null, parentName: null },
      ],
    });
    const issues = [issue({ targetName: 'Dupe', severity: 'med' })];
    const t = buildTriage(parsed, new Set(), new Set(), issues);

    expect(t.byKey.get(classSelKey('Clean'))?.verdict).toBe('auto');
    expect(t.byKey.get(classSelKey('Dupe'))?.verdict).toBe('review');
    expect(t.autoCount).toBe(1);
    expect(t.reviewCount).toBe(1);
  });

  it('excludes classes that already exist (not drafts)', () => {
    const parsed = emptyParsed({
      classes: [{ name: 'Existing', description: '', color: null, parentName: null }],
    });
    const t = buildTriage(parsed, new Set(['Existing']), new Set(), []);
    expect(t.byKey.has(classSelKey('Existing'))).toBe(false);
    expect(t.autoCount + t.reviewCount).toBe(0);
  });

  it('flags a low-confidence relation as review', () => {
    const parsed = emptyParsed({
      relations: [
        { sourceName: 'A', targetName: 'B', relationName: 'r', confidence: 0.5 },
        { sourceName: 'A', targetName: 'C', relationName: 'r', confidence: 0.95 },
      ],
    });
    const t = buildTriage(parsed, new Set(), new Set(), []);
    expect(t.byKey.get(relSelKey(parsed.relations[0]))?.verdict).toBe('review');
    expect(t.byKey.get(relSelKey(parsed.relations[1]))?.verdict).toBe('auto');
  });

  it('flags a relation whose endpoint is an unresolved placeholder', () => {
    const parsed = emptyParsed({
      relations: [{ sourceName: 'A', targetName: 'Ghost', relationName: 'r', confidence: 0.99 }],
      warnings: [
        { kind: 'placeholder_endpoint', name: 'Ghost', message: 'unresolved endpoint' },
      ],
    });
    const t = buildTriage(parsed, new Set(), new Set(), []);
    const outcome = t.byKey.get(relSelKey(parsed.relations[0]));
    expect(outcome?.verdict).toBe('review');
    expect(outcome?.reasons).toContain('unresolved');
  });

  it('flags an instance carrying a matching Critic issue', () => {
    const parsed = emptyParsed({
      instances: [{ className: 'C', name: 'Inst' }],
    });
    const t = buildTriage(parsed, new Set(), new Set(), [
      issue({ targetName: 'Inst', severity: 'high' }),
    ]);
    expect(t.byKey.get(instSelKey('Inst'))?.verdict).toBe('review');
  });
});
