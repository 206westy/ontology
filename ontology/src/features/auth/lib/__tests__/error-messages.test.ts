import { describe, expect, it } from 'vitest';

import { mapAuthError } from '../error-messages';

describe('mapAuthError', () => {
  it('알려진 코드를 한글 메시지로 변환한다', () => {
    expect(mapAuthError({ code: 'invalid_credentials' })).toBe(
      '이메일 또는 비밀번호가 올바르지 않습니다',
    );
    expect(mapAuthError({ code: 'email_not_confirmed' })).toBe(
      '이메일 인증을 먼저 완료해주세요',
    );
    expect(mapAuthError({ code: 'user_already_exists' })).toBe(
      '이미 가입된 이메일입니다',
    );
  });

  it('코드가 없으면 message 휴리스틱으로 매핑한다', () => {
    expect(mapAuthError({ message: 'Invalid login credentials' })).toBe(
      '이메일 또는 비밀번호가 올바르지 않습니다',
    );
  });

  it('알 수 없는 에러는 기본 메시지를 반환한다', () => {
    expect(mapAuthError({ code: 'something_unexpected' })).toBe('잠시 후 다시 시도해주세요');
    expect(mapAuthError(null)).toBe('잠시 후 다시 시도해주세요');
    expect(mapAuthError(undefined)).toBe('잠시 후 다시 시도해주세요');
  });
});
