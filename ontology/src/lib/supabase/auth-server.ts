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

/** 현재 인증된 사용자(없으면 null). getUser 는 토큰을 검증한다. */
export async function getCurrentUser() {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
