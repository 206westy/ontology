import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * 인증 세션용 서버 클라이언트.
 *
 * 주의: 같은 디렉터리의 `server.ts`(createClient/createPureClient)는
 * SERVICE_ROLE_KEY 로 RLS 를 우회하는 데이터 API 전용이다.
 * 인증/세션은 반드시 ANON 키 + 쿠키로 만들어 사용자에 묶여야 하므로
 * 이 파일을 별도로 둔다. 절대 service-role 로 바꾸지 말 것.
 */
export async function createAuthServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component 에서 호출되면 set 이 불가능하다.
            // 미들웨어가 세션을 갱신하므로 무시해도 안전하다.
          }
        },
      },
    },
  );
}

/**
 * 현재 인증된 사용자(없으면 null).
 *
 * 성능(핵심): 미들웨어가 모든 /api·페이지 요청에서 getUser()로 세션을 먼저 "보안 검증"한
 * 뒤에야 이 코드가 실행된다(미인증은 미들웨어가 401/redirect 로 선차단). 그러므로 라우트
 * 핸들러에서 getUser()(원격 Auth HTTPS 왕복 ~0.5-0.7s, 시드니)를 재차 돌 필요가 없다 —
 * getSession()으로 이미 검증·갱신된 쿠키 세션을 로컬에서 읽는다(네트워크 0). 이는 미들웨어의
 * /api 60s 검증 캐시와 동일한 신뢰 모델이며, 라우트당 왕복 1회를 제거해 전 API 지연을 낮춘다.
 * (보안: 위조 토큰은 미들웨어 getUser 가 이미 401 로 차단 → 라우트엔 검증된 토큰만 도달.)
 */
export async function getCurrentUser() {
  const supabase = await createAuthServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}
