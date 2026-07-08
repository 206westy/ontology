import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import {
  AUTH_PAGE_PREFIXES,
  AUTH_PUBLIC_PREFIX,
  DEFAULT_AUTHED_REDIRECT,
  REDIRECT_IF_AUTHED,
  SIGN_IN_PATH,
} from '@/features/auth/constants';

// PRD-M 후속(발행 지연): getUser() 는 Auth 서버 HTTPS 왕복(~0.4-0.7s, 시드니)이라
// /api 요청마다 물면 모든 API 가 그만큼 느려진다. 같은 세션 쿠키가 짧은 TTL 안에
// 재검증을 통과한 이력이 있으면 원격 재검증을 생략한다.
// 보안 트레이드오프(문서화): 서버측 세션 무효화(강제 로그아웃)가 최대 TTL(60s)
// 지연 반영된다. 쿠키 자체가 bearer 자격증명이므로 새로운 공격면은 없다.
// 페이지 라우트는 캐시하지 않는다(리프레시·리다이렉트 의미 보존).
const API_AUTH_TTL_MS = 60_000;
const API_AUTH_MAX_ENTRIES = 1000;
const verifiedApiAuth = new Map<string, number>();

function apiAuthKey(request: NextRequest): string | null {
  const parts = request.cookies
    .getAll()
    .filter((c) => c.name.includes('-auth-token'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `${c.name}=${c.value}`);
  return parts.length > 0 ? parts.join(';') : null;
}

function hasFreshApiAuth(request: NextRequest): boolean {
  const key = apiAuthKey(request);
  if (!key) return false;
  const verifiedAt = verifiedApiAuth.get(key);
  if (verifiedAt === undefined) return false;
  if (Date.now() - verifiedAt > API_AUTH_TTL_MS) {
    verifiedApiAuth.delete(key);
    return false;
  }
  return true;
}

function rememberApiAuth(request: NextRequest): void {
  const key = apiAuthKey(request);
  if (!key) return;
  if (verifiedApiAuth.size >= API_AUTH_MAX_ENTRIES) {
    const oldest = verifiedApiAuth.keys().next().value;
    if (oldest !== undefined) verifiedApiAuth.delete(oldest);
  }
  verifiedApiAuth.set(key, Date.now());
}

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

  // /api 단기 검증 캐시 히트 → 원격 재검증 생략 (위 주석의 트레이드오프 참조)
  if (request.nextUrl.pathname.startsWith('/api/') && hasFreshApiAuth(request)) {
    return supabaseResponse;
  }

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

  // C1: /api/* 코드-게이트. 라우트는 service-role 로 RLS 를 우회하므로
  // 인증은 여기서 강제한다. fetch 가 깨지지 않도록 302 가 아닌 401 JSON 을 반환한다
  // (단일 공유 온톨로지 — 사용자별 격리는 범위 밖, 인증만 요구).
  if (path.startsWith('/api/')) {
    if (!user) {
      return jsonUnauthorized(supabaseResponse);
    }
    rememberApiAuth(request); // 검증 통과 세션만 캐시 (미인증은 매번 재검증)
    return supabaseResponse;
  }

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

/** 미인증 API 요청에 401 JSON 을 반환하되 갱신된 세션 쿠키를 보존한다. */
function jsonUnauthorized(fromResponse: NextResponse): NextResponse {
  const res = NextResponse.json(
    { error: 'Unauthorized', message: '로그인이 필요합니다.' },
    { status: 401 },
  );
  fromResponse.cookies.getAll().forEach((cookie) => {
    res.cookies.set(cookie);
  });
  return res;
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
