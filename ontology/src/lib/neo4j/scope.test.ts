import { describe, it, expect } from 'vitest';
import { buildScopeSystemBlock, countCrossPartition } from './scope';

// PRD-N M2: 구획 스코프 프롬프트/오염 측정 — 순수 함수.

describe('buildScopeSystemBlock', () => {
  it('스코프 없음(null/빈값)이면 빈 문자열 — 기존 무스코프 동작 보존', () => {
    expect(buildScopeSystemBlock(null)).toBe('');
    expect(buildScopeSystemBlock(undefined)).toBe('');
    expect(buildScopeSystemBlock('')).toBe('');
  });

  it('스코프 지정 시 $partition 파라미터 사용을 지시한다(값 하드코딩 금지)', () => {
    const block = buildScopeSystemBlock('00000000-0000-0000-0000-000000000001');
    expect(block).toContain('$partition');
    expect(block).toMatch(/partition = \$partition/);
    // 실제 UUID 값이 프롬프트에 새어 들어가지 않는다.
    expect(block).not.toContain('00000000-0000-0000-0000-000000000001');
  });
});

describe('countCrossPartition', () => {
  it('중첩(properties) 노드에서 타 구획 노드를 센다', () => {
    const rows = [
      { n: { labels: ['Class'], properties: { name: 'Chuck', partition: 'P1' } } },
      { n: { labels: ['Instance'], properties: { name: 'Invoice', partition: 'P2' } } },
    ];
    expect(countCrossPartition(rows, 'P1')).toEqual({ totalNodes: 2, foreignNodes: 1 });
  });

  it('평면(flat) 직렬화도 센다', () => {
    const rows = [
      { name: 'Chuck', partition: 'P1' },
      { name: 'Wafer', partition: 'P1' },
    ];
    expect(countCrossPartition(rows, 'P1')).toEqual({ totalNodes: 2, foreignNodes: 0 });
  });

  it('partition 속성이 없는 집계 결과는 노드 0(오탐 없음)', () => {
    expect(countCrossPartition([{ count: 42 }], 'P1')).toEqual({
      totalNodes: 0,
      foreignNodes: 0,
    });
  });

  it('스코프 준수 결과는 foreignNodes=0', () => {
    const rows = [
      { a: { properties: { partition: 'P1' } }, b: { properties: { partition: 'P1' } } },
    ];
    expect(countCrossPartition(rows, 'P1').foreignNodes).toBe(0);
  });
});
