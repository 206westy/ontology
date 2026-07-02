import { describe, it, expect } from 'vitest';
import { collectDriftElements } from './drift';

// PRD-H (H5/M4 배선): 생성 결과에서 패턴 밖 신규 요소를 모으는 순수 함수.
describe('collectDriftElements', () => {
  const ctx = {
    roles: [{ name: '증상' }, { name: '원인' }],
    relationTypes: [{ name: 'caused_by' }],
  };

  it('collects entity types not in pattern roles as concept drift', () => {
    const drift = collectDriftElements(
      [{ type: '증상' }, { type: '승인단계', description: '결재' }],
      [],
      ctx,
    );
    expect(drift).toEqual([
      { kind: 'concept', name: '승인단계', description: '결재' },
    ]);
  });

  it('collects relation names not in pattern relation types as relation drift', () => {
    const drift = collectDriftElements([], [{ type: 'caused_by' }, { type: 'approved_by' }], ctx);
    expect(drift).toEqual([{ kind: 'relation', name: 'approved_by' }]);
  });

  it('returns empty when everything aligns to the pattern', () => {
    const drift = collectDriftElements([{ type: '증상' }], [{ type: 'caused_by' }], ctx);
    expect(drift).toEqual([]);
  });

  it('dedupes repeated out-of-pattern types by name', () => {
    const drift = collectDriftElements(
      [{ type: '승인단계' }, { type: '승인단계' }],
      [{ type: 'approved_by' }, { type: 'approved_by' }],
      ctx,
    );
    expect(drift).toHaveLength(2);
  });
});
