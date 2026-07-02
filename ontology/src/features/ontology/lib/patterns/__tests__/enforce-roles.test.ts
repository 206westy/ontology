import { describe, it, expect } from 'vitest';
import { enforcePatternRoles } from '../enforce-roles';
import type { ParsedEntity } from '../../schemas';

const roleNames = ['증상', '원인', '점검', '조치'];

function entity(name: string, type: string): ParsedEntity {
  return {
    name,
    type,
    nodeKind: 'class',
    parentType: null,
    evidence: '',
    description: null,
    properties: [],
  };
}

describe('enforcePatternRoles (H3/M2 no-untyped guard)', () => {
  it('produces 0 unmatched/warnings when the pattern roles cover every entity', () => {
    const entities = [
      entity('particle 초과', '증상'),
      entity('Chuck 오염', '원인'),
      entity('chuck 육안 점검', '점검'),
    ];
    const result = enforcePatternRoles(entities, roleNames);
    expect(result.warnings).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
    expect(result.entities.map((e) => e.type)).toEqual(['증상', '원인', '점검']);
  });

  it('normalizes case/whitespace drift to the canonical role name', () => {
    const entities = [entity('RF reflected 상승', '  증상 '), entity('cause', '원인 후보')];
    const result = enforcePatternRoles(entities, roleNames);
    // '  증상 ' → '증상', '원인 후보' → 부분 포함으로 '원인'
    expect(result.entities[0].type).toBe('증상');
    expect(result.entities[1].type).toBe('원인');
    expect(result.warnings).toHaveLength(0);
  });

  it('never blanks an unmatched type — it warns instead of creating an untyped node', () => {
    const entities = [
      entity('particle 초과', '증상'),
      entity('예산 코드', '회계'), // 패턴 밖 개념
      entity('무엇인가', ''), // type 없음
    ];
    const result = enforcePatternRoles(entities, roleNames);
    expect(result.unmatched).toEqual(['예산 코드', '무엇인가']);
    expect(result.warnings).toHaveLength(2);
    // 원본 type 은 보존(조용히 untyped 로 만들지 않음).
    expect(result.entities[1].type).toBe('회계');
    expect(result.entities[2].type).toBe('');
    // 매핑된 노드는 그대로 통과.
    expect(result.entities[0].type).toBe('증상');
  });

  it('does not mutate the input array (immutability)', () => {
    const entities = [entity('x', '  증상')];
    const snapshot = JSON.parse(JSON.stringify(entities));
    enforcePatternRoles(entities, roleNames);
    expect(entities).toEqual(snapshot);
  });
});
