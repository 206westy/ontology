'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { createAuthServerClient } from '@/lib/supabase/auth-server';

import {
  DEFAULT_AUTHED_REDIRECT,
  EMAIL_CONFIRM_PATH,
  RESET_PASSWORD_PATH,
  SIGN_IN_PATH,
} from '../constants';
import { mapAuthError } from './error-messages';
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type SignupInput,
} from './schemas';

export interface ActionResult {
  error?: string;
  /** 이메일이 발송되어 안내 상태로 전환해야 할 때 true */
  emailSent?: boolean;
}

async function getOrigin(): Promise<string> {
  const h = await headers();
  return (
    h.get('origin') ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'http://localhost:3000'
  );
}

export async function signInAction(input: LoginInput): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: '입력값을 확인해주세요' };

  const supabase = await createAuthServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: mapAuthError(error) };

  revalidatePath('/', 'layout');
  redirect(DEFAULT_AUTHED_REDIRECT);
}

export async function signUpAction(input: SignupInput): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { error: '입력값을 확인해주세요' };

  const origin = await getOrigin();
  const supabase = await createAuthServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${origin}${EMAIL_CONFIRM_PATH}`,
    },
  });
  if (error) return { error: mapAuthError(error) };

  // 이미 가입된 이메일이면 Supabase 는 빈 identities 로 응답한다(보안상 노출 최소화).
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    return { error: '이미 가입된 이메일입니다' };
  }

  return { emailSent: true };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createAuthServerClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect(SIGN_IN_PATH);
}

export async function requestPasswordResetAction(
  input: ForgotPasswordInput,
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: '입력값을 확인해주세요' };

  const origin = await getOrigin();
  const supabase = await createAuthServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: `${origin}${RESET_PASSWORD_PATH}` },
  );
  // 보안: 가입 여부와 무관하게 동일한 성공 안내 — 사용자 열거 방지
  if (error) return { error: mapAuthError(error) };

  return { emailSent: true };
}

export async function updatePasswordAction(
  input: ResetPasswordInput,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: '입력값을 확인해주세요' };

  const supabase = await createAuthServerClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { error: mapAuthError(error) };

  revalidatePath('/', 'layout');
  redirect(DEFAULT_AUTHED_REDIRECT);
}
