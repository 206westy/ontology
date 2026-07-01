import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 페이지 라우트 + `/api/*` 를 세션 갱신·게이팅한다.
     * 제외: 정적 자산/이미지/폰트.
     * (C1) API 라우트도 인증을 강제한다. service-role 로 RLS 를 우회하므로
     *  미들웨어가 유일한 인증 체크포인트다. 미인증 API 요청은 302 가 아니라
     *  401 JSON 으로 응답해 fetch 가 깨지지 않게 한다(updateSession 참고).
     */
    '/((?!_next/static|_next/image|favicon.ico|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
};
