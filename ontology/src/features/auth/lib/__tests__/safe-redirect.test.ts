import { describe, expect, it } from 'vitest';

import { safeNextPath } from '../safe-redirect';

describe('safeNextPath', () => {
  it('상대 경로는 그대로 허용한다', () => {
    expect(safeNextPath('/reset-password')).toBe('/reset-password');
    expect(safeNextPath('/')).toBe('/');
  });

  it('절대 URL 을 기본 경로로 막는다', () => {
    expect(safeNextPath('https://evil.com')).toBe('/');
    expect(safeNextPath('http://evil.com/path')).toBe('/');
  });

  it('프로토콜-상대 경로를 막는다', () => {
    expect(safeNextPath('//evil.com')).toBe('/');
    expect(safeNextPath('/\\evil.com')).toBe('/');
  });

  it('빈/누락 값은 기본 경로로 떨어진다', () => {
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
    expect(safeNextPath('')).toBe('/');
  });
});
