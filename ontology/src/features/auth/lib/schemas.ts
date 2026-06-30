import { z } from 'zod';

import { DISPLAY_NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../constants';

const email = z
  .string()
  .min(1, '이메일을 입력하세요')
  .email('올바른 이메일 형식이 아닙니다');

// 신규 비밀번호(가입/재설정)는 최소 길이를 강제한다.
const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다`);

// 로그인은 기존 계정(짧은 비밀번호 포함)을 막지 않도록 존재 여부만 검증한다.
const loginPassword = z.string().min(1, '비밀번호를 입력하세요');

export const loginSchema = z.object({
  email,
  password: loginPassword,
});

export const signupSchema = z
  .object({
    displayName: z
      .string()
      .min(1, '이름을 입력하세요')
      .max(DISPLAY_NAME_MAX_LENGTH, `이름은 ${DISPLAY_NAME_MAX_LENGTH}자 이하여야 합니다`),
    email,
    password: newPassword,
    confirmPassword: z.string().min(1, '비밀번호를 한 번 더 입력하세요'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: '비밀번호가 일치하지 않습니다',
  });

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z
  .object({
    password: newPassword,
    confirmPassword: z.string().min(1, '비밀번호를 한 번 더 입력하세요'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: '비밀번호가 일치하지 않습니다',
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
