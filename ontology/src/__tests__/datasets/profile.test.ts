import { describe, it, expect } from 'vitest';
import { parseCsv, profileCsv } from '@/lib/datasets/profile';

describe('parseCsv', () => {
  it('헤더와 행을 분리한다', () => {
    const { headers, rows } = parseCsv('a,b,c\n1,2,3\n4,5,6');
    expect(headers).toEqual(['a', 'b', 'c']);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(['1', '2', '3']);
  });

  it('따옴표 안의 콤마·개행을 필드로 보존한다', () => {
    const { rows } = parseCsv('name,note\n"a, b","line1\nline2"');
    expect(rows[0][0]).toBe('a, b');
    expect(rows[0][1]).toBe('line1\nline2');
  });

  it('이스케이프된 따옴표("")를 처리한다', () => {
    const { rows } = parseCsv('x\n"he said ""hi"""');
    expect(rows[0][0]).toBe('he said "hi"');
  });
});

describe('profileCsv', () => {
  it('정수 컬럼 타입을 추론한다', () => {
    const p = profileCsv('measure\n10\n20\n30');
    expect(p.rowCount).toBe(3);
    expect(p.columns[0].dataType).toBe('integer');
    expect(p.columns[0].minValue).toBe('10');
    expect(p.columns[0].maxValue).toBe('30');
  });

  it('결측률을 계산한다(빈 줄이 아니라 빈 값 기준)', () => {
    // b 컬럼: [x, '', z] → 결측 1/3. (완전 공백 줄은 데이터 행이 아니므로 제거됨)
    const p = profileCsv('a,b\n1,x\n2,\n3,z');
    const b = p.columns.find((c) => c.name === 'b')!;
    expect(b.missingRate).toBeCloseTo(1 / 3, 5);
    expect(b.nullable).toBe(true);
  });

  it('낮은 카디널리티 문자열을 enum 으로 감지한다', () => {
    const p = profileCsv('grade\nA\nB\nA\nB\nA');
    expect(p.columns[0].dataType).toBe('enum');
    expect(p.columns[0].enumValues).toEqual(expect.arrayContaining(['A', 'B']));
    expect(p.columns[0].distinctCount).toBe(2);
  });

  it('동일 입력 → 동일 체크섬(결정론)', () => {
    const a = profileCsv('x,y\n1,a\n2,b');
    const b = profileCsv('x,y\n1,a\n2,b');
    expect(a.checksum).toBe(b.checksum);
  });

  it('스키마가 바뀌면 체크섬이 달라진다(드리프트 감지)', () => {
    const a = profileCsv('x\n1\n2');
    const b = profileCsv('x,z\n1,9\n2,8');
    expect(a.checksum).not.toBe(b.checksum);
  });
});
