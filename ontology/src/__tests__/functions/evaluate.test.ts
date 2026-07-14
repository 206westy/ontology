import { describe, it, expect } from 'vitest';
import {
  evaluateAst,
  astNodeSchema,
  collectVarNames,
  AstEvalError,
  type AstNode,
} from '@/lib/functions/ast';
import {
  evaluateFunction,
  hashInput,
  canonicalize,
  normalizeVerdict,
} from '@/lib/functions/evaluate';

// "결함밀도가 0.5 미만이면 통과" → defect_density < 0.5
const logic: AstNode = {
  type: 'binary',
  op: '<',
  left: { type: 'var', name: 'defect_density' },
  right: { type: 'lit', value: 0.5 },
};

describe('AST 결정함수 평가엔진 (PRD-PF-B)', () => {
  it('속성을 읽어 통과/불통과를 판정한다', () => {
    const pass = evaluateFunction({
      logic,
      outputSpec: { kind: 'pass_fail' },
      bindings: { defect_density: 0.3 },
    });
    expect(pass.verdict.pass).toBe(true);
    expect(pass.verdict.label).toBe('통과');

    const fail = evaluateFunction({
      logic,
      outputSpec: { kind: 'pass_fail' },
      bindings: { defect_density: 0.7 },
    });
    expect(fail.verdict.pass).toBe(false);
    expect(fail.verdict.label).toBe('불통과');
  });

  it('결정론: 동일 입력 → 동일 해시·동일 판정', () => {
    const a = evaluateFunction({
      logic,
      outputSpec: { kind: 'pass_fail' },
      bindings: { defect_density: 0.42 },
    });
    const b = evaluateFunction({
      logic,
      outputSpec: { kind: 'pass_fail' },
      bindings: { defect_density: 0.42 },
    });
    expect(a.inputHash).toBe(b.inputHash);
    expect(a.verdict.raw).toBe(b.verdict.raw);
  });

  it('canonicalize/hashInput 은 키 순서 무관하게 동일', () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
    expect(hashInput({ a: 1, b: 2 })).toBe(hashInput({ b: 2, a: 1 }));
  });

  it('정의되지 않은 입력 참조는 거부(감사 안전)', () => {
    expect(() => evaluateAst({ type: 'var', name: 'missing' }, {})).toThrow(
      AstEvalError,
    );
  });

  it('화이트리스트 밖 구조(임의 호출 등)는 스키마가 거부', () => {
    expect(astNodeSchema.safeParse({ type: 'call', fn: 'fetch' }).success).toBe(
      false,
    );
    expect(astNodeSchema.safeParse(logic).success).toBe(true);
  });

  it('logic 참조 변수 수집(Critic 미정의 입력 사전검출)', () => {
    expect([...collectVarNames(logic)]).toEqual(['defect_density']);
  });

  it('score/recommend 정규화(범위 클램프 포함)', () => {
    expect(normalizeVerdict(0.85, { kind: 'score', min: 0, max: 1 }).score).toBe(
      0.85,
    );
    expect(normalizeVerdict(2, { kind: 'score', min: 0, max: 1 }).score).toBe(1);
    expect(
      normalizeVerdict('정비필요', { kind: 'recommend' }).recommendation,
    ).toBe('정비필요');
  });

  it('논리 결합(and) + 단축평가', () => {
    const inRange: AstNode = {
      type: 'logical',
      op: 'and',
      args: [
        { type: 'binary', op: '>', left: { type: 'var', name: 'x' }, right: { type: 'lit', value: 0 } },
        { type: 'binary', op: '<', left: { type: 'var', name: 'x' }, right: { type: 'lit', value: 10 } },
      ],
    };
    expect(evaluateAst(inRange, { x: 5 })).toBe(true);
    expect(evaluateAst(inRange, { x: 15 })).toBe(false);
  });

  it('0으로 나누기는 안전하게 거부', () => {
    const div: AstNode = {
      type: 'binary',
      op: '/',
      left: { type: 'lit', value: 1 },
      right: { type: 'lit', value: 0 },
    };
    expect(() => evaluateAst(div, {})).toThrow(AstEvalError);
  });
});
