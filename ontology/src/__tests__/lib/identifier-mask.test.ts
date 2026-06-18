import { describe, it, expect } from 'vitest';
import {
  maskIdentifiers,
  hasMaskableIdentifiers,
} from '@/features/ontology/lib/identifier-mask';

describe('identifier-mask (A-4 security guard)', () => {
  it('masks PSK part numbers (KC…)', () => {
    const out = maskIdentifiers('교체 부품: KC0330655 확인');
    expect(out).not.toContain('KC0330655');
    expect(out).toContain('[부품번호]');
  });

  it('masks equipment unit names (…호기)', () => {
    const out = maskIdentifiers('1호기 와 12 호기 점검');
    expect(out).not.toMatch(/\d+\s*호기/);
    expect(out).toContain('[호기]');
  });

  it('masks generic internal alphanumeric codes', () => {
    const out = maskIdentifiers('코드 AB12345 로 조회');
    expect(out).not.toContain('AB12345');
    expect(out).toContain('[코드]');
  });

  it('leaves domain-neutral terms untouched', () => {
    const text = 'RF Matcher 의 정의는 무엇인가';
    expect(maskIdentifiers(text)).toBe(text);
    expect(hasMaskableIdentifiers(text)).toBe(false);
  });

  it('hasMaskableIdentifiers detects in-house identifiers', () => {
    expect(hasMaskableIdentifiers('KC0330655')).toBe(true);
    expect(hasMaskableIdentifiers('3호기')).toBe(true);
  });
});
