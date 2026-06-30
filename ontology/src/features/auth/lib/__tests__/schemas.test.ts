import { describe, expect, it } from 'vitest';

import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from '../schemas';

describe('loginSchema', () => {
  it('유효한 이메일/비밀번호를 통과시킨다', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('잘못된 이메일 형식을 거부한다', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'password123' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toBeDefined();
    }
  });

  it('짧은 비밀번호도 허용한다(기존 계정 로그인 보호)', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: '1234' });
    expect(result.success).toBe(true);
  });

  it('빈 비밀번호를 거부한다', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: '' });
    expect(result.success).toBe(false);
  });

  it('빈 이메일을 거부한다', () => {
    const result = loginSchema.safeParse({ email: '', password: 'password123' });
    expect(result.success).toBe(false);
  });
});

describe('signupSchema', () => {
  const base = {
    displayName: '홍길동',
    email: 'user@example.com',
    password: 'password123',
    confirmPassword: 'password123',
  };

  it('일치하는 비밀번호를 통과시킨다', () => {
    expect(signupSchema.safeParse(base).success).toBe(true);
  });

  it('비밀번호 불일치를 confirmPassword 경로 에러로 거부한다', () => {
    const result = signupSchema.safeParse({ ...base, confirmPassword: 'different1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmPassword).toBeDefined();
    }
  });

  it('8자 미만 비밀번호를 거부한다', () => {
    const result = signupSchema.safeParse({
      ...base,
      password: '1234',
      confirmPassword: '1234',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password).toBeDefined();
    }
  });

  it('빈 이름을 거부한다', () => {
    const result = signupSchema.safeParse({ ...base, displayName: '' });
    expect(result.success).toBe(false);
  });

  it('40자를 초과하는 이름을 거부한다', () => {
    const result = signupSchema.safeParse({ ...base, displayName: 'ㄱ'.repeat(41) });
    expect(result.success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('이메일만 검증한다', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'user@example.com' }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: 'bad' }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('일치하는 새 비밀번호를 통과시킨다', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'newpassword1',
      confirmPassword: 'newpassword1',
    });
    expect(result.success).toBe(true);
  });

  it('불일치를 거부한다', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'newpassword1',
      confirmPassword: 'mismatch12',
    });
    expect(result.success).toBe(false);
  });
});
