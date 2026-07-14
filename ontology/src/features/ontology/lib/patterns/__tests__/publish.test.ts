import { describe, it, expect } from 'vitest';
import { computePatternHealth, buildPublishPreview } from '../publish';
import type { Pattern } from '../types';

function makePattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: 'pat-1',
    key: 'equipment',
    name: 'Equipment',
    nameKo: '장비',
    version: 1,
    domain: 'equipment',
    roles: [
      { name: 'Equipment', nodeKind: 'class', description: '장비' },
      { name: 'Site', nodeKind: 'class', description: '사이트' },
      { name: 'Engineer', nodeKind: 'class', description: '엔지니어' },
    ],
    relationTypes: [
      { name: 'located_at', layer: 'semantic', sourceRole: 'Equipment', targetRole: 'Site' },
    ],
    competencyQuestions: ['q1', 'q2', 'q3'],
    traversalTemplates: [],
    method: 'synthesized',
    sourceRepo: null,
    sourceUri: null,
    sourceLabel: null,
    license: 'CC0-1.0',
    occurrenceCount: 1,
    isDraft: false,
    previousVersionId: null,
    createdAt: '2026-07-13T00:00:00.000Z',
    ...overrides,
  };
}

describe('computePatternHealth', () => {
  it('완전한 패턴(역할3·연결·CQ3·라이선스)은 100 에 가깝다', () => {
    expect(computePatternHealth(makePattern())).toBe(100);
  });

  it('라이선스 미확인은 점수를 깎는다', () => {
    const full = computePatternHealth(makePattern());
    const unlicensed = computePatternHealth(makePattern({ license: null }));
    expect(unlicensed).toBeLessThan(full);
  });

  it('역할만 있고 관계·CQ 없으면 낮다', () => {
    const score = computePatternHealth(
      makePattern({ relationTypes: [], competencyQuestions: [], license: null }),
    );
    expect(score).toBeLessThan(50);
  });

  it('빈 패턴은 0 에 가깝다', () => {
    const score = computePatternHealth(
      makePattern({ roles: [], relationTypes: [], competencyQuestions: [], license: null }),
    );
    expect(score).toBeLessThanOrEqual(20);
  });

  it('0~100 범위를 벗어나지 않는다', () => {
    const score = computePatternHealth(makePattern());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('buildPublishPreview', () => {
  it('역할 이름의 민감 식별자를 마스킹한다(부품번호)', () => {
    const preview = buildPublishPreview(
      makePattern({
        roles: [{ name: 'KC0330655', nodeKind: 'class', description: '부품 KC0330655' }],
        relationTypes: [],
      }),
    );
    expect(preview.maskedRoles[0].name).toBe('[부품번호]');
    expect(preview.maskedRoles[0].description).toContain('[부품번호]');
    expect(preview.hasMaskedIdentifiers).toBe(true);
  });

  it('역할과 관계의 role 참조를 동일하게 마스킹해 정합을 유지한다', () => {
    const preview = buildPublishPreview(
      makePattern({
        roles: [
          { name: 'KC0330655', nodeKind: 'class', description: '' },
          { name: 'Site', nodeKind: 'class', description: '' },
        ],
        relationTypes: [
          { name: 'located_at', layer: 'semantic', sourceRole: 'KC0330655', targetRole: 'Site' },
        ],
      }),
    );
    // 관계의 sourceRole 도 동일 마스킹 → 마스킹된 역할 이름과 일치.
    expect(preview.maskedRelationTypes[0].sourceRole).toBe('[부품번호]');
    expect(preview.maskedRoles[0].name).toBe('[부품번호]');
  });

  it('traversalTemplates 의 cq/path 식별자도 마스킹한다(누락 방지)', () => {
    const preview = buildPublishPreview(
      makePattern({
        competencyQuestions: [],
        traversalTemplates: [{ cq: '1호기 장비의 공급업체는?', path: 'KC0330655-supplied_by->공급사' }],
      }),
    );
    expect(preview.maskedTraversalTemplates[0].cq).toContain('[호기]');
    expect(preview.maskedTraversalTemplates[0].path).toContain('[부품번호]');
    expect(preview.hasMaskedIdentifiers).toBe(true);
  });

  it('민감 식별자가 없으면 hasMaskedIdentifiers=false', () => {
    const preview = buildPublishPreview(makePattern());
    expect(preview.hasMaskedIdentifiers).toBe(false);
  });

  it('라이선스 확인되면 경고 없음, 미확인이면 경고 문자열', () => {
    expect(buildPublishPreview(makePattern()).licenseWarning).toBeNull();
    expect(buildPublishPreview(makePattern({ license: null })).licenseWarning).toContain('라이선스');
  });

  it('health 를 함께 반환한다', () => {
    const preview = buildPublishPreview(makePattern());
    expect(preview.health).toBe(100);
  });
});
