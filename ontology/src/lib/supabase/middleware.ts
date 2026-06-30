import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import {
  AUTH_PAGE_PREFIXES,
  AUTH_PUBLIC_PREFIX,
  DEFAULT_AUTHED_REDIRECT,
  REDIRECT_IF_AUTHED,
  SIGN_IN_PATH,
} from '@/features/auth/constants';

/**
 * 세션 리프레시 + 라우트 게이팅.
 *
 * GOTCHA(중요):
 *  1) 반드시 getUser() 사용 — getSession()은 쿠키만 신뢰해 게이팅 우회 위험.
 *  2) setAll 에서 response 를 새로 만들면 쿠키를 그대로 복사해야 한다.
 *     누락 시 리프레시 토큰이 유실되어 무한 로그아웃 루프가 발생한다.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() 호출이 토큰을 검증·갱신한다. createServerClient 직후 즉시 호출.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = AUTH_PAGE_PREFIXES.some((p) => path.startsWith(p));
  const isAuthPublic =
    path === AUTH_PUBLIC_PREFIX || path.startsWith(`${AUTH_PUBLIC_PREFIX}/`);

  // 미인증 + 보호 라우트 → 로그인으로
  if (!user && !isAuthPage && !isAuthPublic) {
    return redirectKeepingCookies(request, SIGN_IN_PATH, supabaseResponse);
  }

  // 인증됨 + 로그인/회원가입 페이지 → 앱으로
  if (user && REDIRECT_IF_AUTHED.some((p) => path === p)) {
    return redirectKeepingCookies(
      request,
      DEFAULT_AUTHED_REDIRECT,
      supabaseResponse,
    );
  }

  return supabaseResponse;
}

/** 리다이렉트하되 갱신된 세션 쿠키를 새 응답으로 옮긴다. */
function redirectKeepingCookies(
  request: NextRequest,
  pathname: string,
  fromResponse: NextResponse,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  const redirect = NextResponse.redirect(url);
  fromResponse.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });
  return redirect;
}
