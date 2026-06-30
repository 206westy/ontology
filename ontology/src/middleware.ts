import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 페이지 라우트만 세션 갱신·게이팅한다.
     * 제외: 정적 자산/이미지/폰트, 그리고 `/api/*`.
     * (API 라우트는 service-role 로 동작하며 사용자별 authz/RLS 는 별도 스코프다.
     *  여기서 게이팅하면 fetch 가 HTML 로그인 페이지로 302 되어 깨진다.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
};
