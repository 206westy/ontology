import { describe, it, expect } from 'vitest';
import {
  checkDuplicateExisting,
  checkDuplicateWithin,
  checkStarHub,
  checkOrphans,
  checkUndefinedConcepts,
  checkClassInstanceConfusion,
  reviewProposal,
  type ReviewInput,
} from '@/features/ontology/lib/critic/review';

const empty: ReviewInput['proposed'] = { classes: [], instances: [], relations: [] };

describe('checkDuplicateExisting', () => {
  it('flags a new class identical to an existing one as high severity', () => {
    const input: ReviewInput = {
      proposed: { ...empty, classes: [{ name: 'Chuck' }] },
      existing: { classNames: ['Chuck'], instanceNames: [] },
    };
    const issues = checkDuplicateExisting(input);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('high');
    expect(issues[0].relatedName).toBe('Chuck');
  });

  it('flags a near-duplicate (typo) as med severity', () => {
    const input: ReviewInput = {
      proposed: { ...empty, classes: [{ name: 'Chuk' }] },
      existing: { classNames: ['Chuck'], instanceNames: [] },
    };
    const issues = checkDuplicateExisting(input);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('med');
  });

  it('does not flag a genuinely new name', () => {
    const input: ReviewInput = {
      proposed: { ...empty, classes: [{ name: 'RF Matcher' }] },
      existing: { classNames: ['Chuck'], instanceNames: [] },
    };
    expect(checkDuplicateExisting(input)).toHaveLength(0);
  });
});

describe('checkDuplicateWithin', () => {
  it('flags two near-duplicate new classes', () => {
    const input: ReviewInput = {
      proposed: { ...empty, classes: [{ name: 'Chuck' }, { name: 'Chuk' }] },
    };
    const issues = checkDuplicateWithin(input);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('duplicate_within');
  });
});

describe('checkStarHub', () => {
  it('flags a star-shaped relation set', () => {
    const input: ReviewInput = {
      proposed: {
        ...empty,
        relations: [
          { source: 'Doc', target: 'A', type: 'rel' },
          { source: 'Doc', target: 'B', type: 'rel' },
          { source: 'Doc', target: 'C', type: 'rel' },
          { source: 'Doc', target: 'D', type: 'rel' },
        ],
      },
    };
    const issues = checkStarHub(input);
    expect(issues).toHaveLength(1);
    expect(issues[0].targetName).toBe('Doc');
    expect(issues[0].severity).toBe('high');
  });

  it('does not flag a distributed (chain) relation set', () => {
    const input: ReviewInput = {
      proposed: {
        ...empty,
        relations: [
          { source: 'A', target: 'B', type: 'rel' },
          { source: 'B', target: 'C', type: 'rel' },
          { source: 'C', target: 'D', type: 'rel' },
          { source: 'D', target: 'E', type: 'rel' },
        ],
      },
    };
    expect(checkStarHub(input)).toHaveLength(0);
  });

  it('does not flag below the minimum relation count', () => {
    const input: ReviewInput = {
      proposed: {
        ...empty,
        relations: [
          { source: 'Doc', target: 'A', type: 'rel' },
          { source: 'Doc', target: 'B', type: 'rel' },
        ],
      },
    };
    expect(checkStarHub(input)).toHaveLength(0);
  });
});

describe('checkOrphans', () => {
  it('flags a class with no relations and no parent', () => {
    const input: ReviewInput = {
      proposed: { ...empty, classes: [{ name: 'Lonely' }] },
    };
    const issues = checkOrphans(input);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('orphan');
    expect(issues[0].severity).toBe('low');
  });

  it('does not flag a class connected by a relation', () => {
    const input: ReviewInput = {
      proposed: {
        ...empty,
        classes: [{ name: 'A' }, { name: 'B' }],
        relations: [{ source: 'A', target: 'B', type: 'rel' }],
      },
    };
    expect(checkOrphans(input)).toHaveLength(0);
  });

  it('does not flag a class connected via parent hierarchy', () => {
    const input: ReviewInput = {
      proposed: { ...empty, classes: [{ name: 'Dog', type: 'Animal' }] },
    };
    expect(checkOrphans(input)).toHaveLength(0);
  });

  it('does not flag a class that is the parent of another node', () => {
    // Animal has no relations and no parent of its own, but it IS Buddy's parent
    // → connected via hierarchy, not an orphan.
    const input: ReviewInput = {
      proposed: { ...empty, classes: [{ name: 'Animal' }, { name: 'Buddy', type: 'Animal' }] },
    };
    expect(checkOrphans(input)).toHaveLength(0);
  });
});

describe('checkUndefinedConcepts', () => {
  it('flags a relation endpoint that is never defined', () => {
    const input: ReviewInput = {
      proposed: {
        ...empty,
        classes: [{ name: 'Pump' }],
        relations: [{ source: 'Pump', target: 'RF Matcher', type: 'uses' }],
      },
    };
    const issues = checkUndefinedConcepts(input);
    expect(issues).toHaveLength(1);
    expect(issues[0].targetName).toBe('RF Matcher');
    expect(issues[0].severity).toBe('high');
  });

  it('does not flag endpoints defined in the existing model', () => {
    const input: ReviewInput = {
      proposed: {
        ...empty,
        classes: [{ name: 'Pump' }],
        relations: [{ source: 'Pump', target: 'Chuck', type: 'uses' }],
      },
      existing: { classNames: ['Chuck'], instanceNames: [] },
    };
    expect(checkUndefinedConcepts(input)).toHaveLength(0);
  });
});

describe('checkClassInstanceConfusion', () => {
  it('flags a proposed class that collides with an existing instance name', () => {
    const input: ReviewInput = {
      proposed: { ...empty, classes: [{ name: 'Rex' }] },
      existing: { classNames: [], instanceNames: ['Rex'] },
    };
    const issues = checkClassInstanceConfusion(input);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('class_instance_confusion');
  });
});

describe('reviewProposal', () => {
  it('aggregates, dedupes, and sorts issues by severity', () => {
    const input: ReviewInput = {
      proposed: {
        classes: [{ name: 'Chuck' }, { name: 'Lonely' }],
        instances: [],
        relations: [
          { source: 'Doc', target: 'A', type: 'rel' },
          { source: 'Doc', target: 'B', type: 'rel' },
          { source: 'Doc', target: 'C', type: 'rel' },
          { source: 'Doc', target: 'D', type: 'rel' },
        ],
      },
      existing: { classNames: ['Chuck'], instanceNames: [] },
    };
    const report = reviewProposal(input);
    // duplicate_existing(high) + star_hub(high) + undefined Doc/A/B/C/D(high) + orphan Lonely(low)
    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.summary.high).toBeGreaterThanOrEqual(2);
    // sorted: high first, low last
    expect(report.issues[0].severity).toBe('high');
    expect(report.issues[report.issues.length - 1].severity).toBe('low');
  });

  it('returns an empty report for a clean proposal', () => {
    const input: ReviewInput = {
      proposed: {
        classes: [{ name: 'A' }, { name: 'B' }],
        instances: [],
        relations: [{ source: 'A', target: 'B', type: 'rel' }],
      },
      existing: { classNames: [], instanceNames: [] },
    };
    const report = reviewProposal(input);
    expect(report.summary.total).toBe(0);
    expect(report.issues).toHaveLength(0);
  });
});
