import { describe, it, expect, beforeEach } from 'vitest';
import {
  GENERAL_RULES,
  DOMAIN_RULES,
  registerDomainRules,
  resolveRules,
  getRule,
  filterIssuesByRules,
  type CriticRule,
} from '@/features/ontology/lib/critic/rules';
import { reviewProposal, type CriticIssue, type ReviewInput } from '@/features/ontology/lib/critic/review';

describe('critic rules registry', () => {
  it('every ruleId emitted by the deterministic checkers exists in the registry', () => {
    // Construct a proposal that triggers every deterministic kind at once.
    const input: ReviewInput = {
      proposed: {
        classes: [{ name: 'Chuck' }, { name: 'Chuk' }, { name: 'Lonely' }, { name: 'Rex' }],
        instances: [],
        relations: [
          { source: 'Doc', target: 'A', type: 'rel' },
          { source: 'Doc', target: 'B', type: 'rel' },
          { source: 'Doc', target: 'C', type: 'rel' },
          { source: 'Doc', target: 'D', type: 'rel' },
        ],
      },
      existing: { classNames: ['Chuck'], instanceNames: ['Rex'] },
    };
    const report = reviewProposal(input);
    const registryIds = new Set(GENERAL_RULES.map((r) => r.id));
    for (const issue of report.issues) {
      expect(registryIds.has(issue.ruleId)).toBe(true);
    }
  });

  it('exposes a rule for both LLM qualitative kinds', () => {
    expect(getRule('llm-contradictory_relation')).toBeDefined();
    expect(getRule('llm-weak_modeling')).toBeDefined();
  });

  it('has unique rule ids', () => {
    const ids = GENERAL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('filterIssuesByRules', () => {
  const issues: CriticIssue[] = [
    { kind: 'orphan', severity: 'low', targetName: 'X', reason: '', ruleId: 'orphan' },
    { kind: 'star_hub', severity: 'high', targetName: 'Hub', reason: '', ruleId: 'star-hub' },
  ];

  it('removes issues whose rule id is explicitly disabled', () => {
    const out = filterIssuesByRules(issues, { disabledIds: ['orphan'] });
    expect(out).toHaveLength(1);
    expect(out[0].ruleId).toBe('star-hub');
  });

  it('keeps issues for unknown rule ids (forward-compatible)', () => {
    const unknown: CriticIssue[] = [
      { kind: 'weak_modeling', severity: 'med', targetName: 'Y', reason: '', ruleId: 'future-rule' },
    ];
    expect(filterIssuesByRules(unknown)).toHaveLength(1);
  });
});

describe('domain rule extension', () => {
  beforeEach(() => {
    // Clean the domain slot between tests.
    for (const key of Object.keys(DOMAIN_RULES)) delete DOMAIN_RULES[key];
  });

  it('lets a domain override a general rule by id', () => {
    const stricter: CriticRule = {
      id: 'orphan',
      kind: 'orphan',
      label: '고립 노드(엄격)',
      description: '반도체 도메인에서는 고립을 엄격히 본다.',
      defaultSeverity: 'high',
      enabledByDefault: true,
    };
    registerDomainRules('semiconductor', [stricter]);
    const resolved = getRule('orphan', 'semiconductor');
    expect(resolved?.defaultSeverity).toBe('high');
    // General resolution is unaffected.
    expect(getRule('orphan')?.defaultSeverity).toBe('low');
  });

  it('resolveRules without a domain returns only general rules', () => {
    registerDomainRules('semiconductor', [
      { id: 'sc-only', kind: 'weak_modeling', label: 'x', description: 'x', defaultSeverity: 'med', enabledByDefault: true },
    ]);
    expect(resolveRules().find((r) => r.id === 'sc-only')).toBeUndefined();
    expect(resolveRules('semiconductor').find((r) => r.id === 'sc-only')).toBeDefined();
  });
});
