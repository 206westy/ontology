import { describe, it, expect } from 'vitest';
import {
  extendPattern,
  driftElementsToExtension,
  extendedPatternToPromote,
} from './extend';
import type { Pattern } from './types';
import type { DriftElement } from './drift';

const base: Pattern = {
  id: 'pat-1',
  key: 'diagnostic',
  name: 'Diagnostic',
  nameKo: '진단',
  version: 1,
  domain: 'diagnostic',
  roles: [
    { name: '증상', nodeKind: 'class', description: '' },
    { name: '원인', nodeKind: 'class', description: '' },
  ],
  relationTypes: [
    { name: 'caused_by', layer: 'semantic', sourceRole: '증상', targetRole: '원인' },
  ],
  competencyQuestions: ['이 증상의 원인은?'],
  traversalTemplates: [{ cq: '이 증상의 원인은?', path: '증상-caused_by->원인' }],
  method: 'synthesized',
  sourceRepo: null,
  sourceUri: null,
  sourceLabel: null,
  license: null,
  occurrenceCount: 1,
  isDraft: false,
  previousVersionId: null,
  createdAt: '2026-07-02T00:00:00.000Z',
};

describe('extendPattern (H5 확장 = 패턴 버전업)', () => {
  it('bumps version and links previousVersionId to the base id', () => {
    const next = extendPattern(base, {
      roles: [{ name: '조치', nodeKind: 'class', description: '' }],
    });
    expect(next.version).toBe(2);
    expect(next.previousVersionId).toBe('pat-1');
    expect(next.isDraft).toBe(true);
  });

  it('appends new roles/relations without dropping the base ones', () => {
    const next = extendPattern(base, {
      roles: [{ name: '조치', nodeKind: 'class', description: '수리' }],
      relationTypes: [
        { name: 'fixed_by', layer: 'kinetic', sourceRole: '원인', targetRole: '조치' },
      ],
    });
    expect(next.roles.map((r) => r.name)).toEqual(['증상', '원인', '조치']);
    expect(next.relationTypes.map((r) => r.name)).toEqual(['caused_by', 'fixed_by']);
  });

  it('does not duplicate a role/relation that already exists by name', () => {
    const next = extendPattern(base, {
      roles: [{ name: '원인', nodeKind: 'class', description: 'dup' }],
    });
    expect(next.roles.filter((r) => r.name === '원인')).toHaveLength(1);
  });

  it('is immutable — does not mutate the base pattern arrays', () => {
    const rolesBefore = base.roles;
    const rolesLenBefore = base.roles.length;
    extendPattern(base, {
      roles: [{ name: '조치', nodeKind: 'class', description: '' }],
    });
    expect(base.roles).toBe(rolesBefore);
    expect(base.roles).toHaveLength(rolesLenBefore);
    expect(base.version).toBe(1);
  });
});

describe('driftElementsToExtension', () => {
  it('maps concept elements to roles and relation elements to relationTypes', () => {
    const els: DriftElement[] = [
      { kind: 'concept', name: '조치', description: '수리 작업' },
      { kind: 'relation', name: 'fixed_by', sourceRole: '원인', targetRole: '조치' },
    ];
    const ext = driftElementsToExtension(els);
    expect(ext.roles).toEqual([
      { name: '조치', nodeKind: 'class', description: '수리 작업' },
    ]);
    expect(ext.relationTypes).toEqual([
      { name: 'fixed_by', layer: 'semantic', sourceRole: '원인', targetRole: '조치' },
    ]);
  });
});

describe('extendedPatternToPromote', () => {
  it('produces a promote input carrying the extended bundle', () => {
    const next = extendPattern(base, {
      roles: [{ name: '조치', nodeKind: 'class', description: '' }],
    });
    const promote = extendedPatternToPromote(next);
    expect(promote.key).toBe('diagnostic');
    expect(promote.domain).toBe('diagnostic');
    expect(promote.roles.map((r) => r.name)).toContain('조치');
  });
});
