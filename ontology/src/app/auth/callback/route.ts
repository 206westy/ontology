import { NextResponse, type NextRequest } from 'next/server';

import { AUTH_ERROR_PATH } from '@/features/auth/constants';
import { safeNextPath } from '@/features/auth/lib/safe-redirect';
import { createAuthServerClient } from '@/lib/supabase/auth-server';

/**
 * OAuth / PKCE code exchange 콜백 (소셜 로그인 확장 지점).
 * 현재 스코프에서는 소셜 로그인을 노출하지 않지만, 추후 연동 시 그대로 사용한다.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));

  if (code) {
    const supabase = await createAuthServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}${AUTH_ERROR_PATH}`);
}
