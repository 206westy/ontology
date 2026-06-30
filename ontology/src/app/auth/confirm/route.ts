import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

import { AUTH_ERROR_PATH } from '@/features/auth/constants';
import { safeNextPath } from '@/features/auth/lib/safe-redirect';
import { createAuthServerClient } from '@/lib/supabase/auth-server';

/**
 * 이메일 확인 / 비밀번호 재설정 링크 콜백.
 * Supabase 이메일 링크는 token_hash + type 으로 도착한다.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNextPath(searchParams.get('next'));

  if (tokenHash && type) {
    const supabase = await createAuthServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL(AUTH_ERROR_PATH, request.url));
}
