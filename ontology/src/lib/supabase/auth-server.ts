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

export interface AuthUser {
  id: string;
  email: string | null;
}

/** base64/base64url → JSON(파싱 실패 시 null). */
function decodeB64Json(b64: string): Record<string, unknown> | null {
  try {
    const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(norm, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * 현재 인증된 사용자(없으면 null).
 *
 * 성능+정합(핵심): 미들웨어가 모든 /api·페이지 요청에서 getUser()로 세션을 먼저 "보안 검증"한
 * 뒤에야 라우트 핸들러가 실행된다(미인증은 미들웨어가 401/redirect 로 선차단). 따라서 라우트에서
 * getUser()(원격 Auth HTTPS 왕복 ~0.5-0.7s, 시드니)를 재차 돌 필요가 없다 — 검증·갱신된 쿠키
 * 세션에서 사용자 식별자만 로컬로 읽는다(네트워크 0). 미들웨어의 /api 60s 검증 캐시와 동일 신뢰 모델.
 *
 * ★getSession() 미사용★: supabase.auth.getSession()은 서버에서 session.user 접근 시
 * "Using the user object ... could be insecure" 경고를 매 요청 로깅한다. Supabase 메서드 대신
 * @supabase/ssr auth 쿠키를 직접 파싱해 경고를 원천 제거한다(보안·성능 동일). 파싱 실패 시 null.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  // sb-<ref>-auth-token (+ 청크 .0/.1). 값 = 'base64-' + base64(JSON session). code-verifier 는 제외.
  const raw = store
    .getAll()
    .filter((c) => /-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.value)
    .join('');
  if (!raw) return null;

  const payload = raw.startsWith('base64-') ? raw.slice(7) : raw;
  const session = decodeB64Json(payload) as
    | { access_token?: string; user?: { id?: string; email?: string | null } }
    | null;
  if (!session) return null;

  if (session.user?.id) {
    return { id: session.user.id, email: session.user.email ?? null };
  }
  // 폴백: access_token JWT payload 의 sub.
  const jwtPayload = session.access_token?.split('.')[1];
  if (jwtPayload) {
    const claims = decodeB64Json(jwtPayload) as { sub?: string; email?: string } | null;
    if (claims?.sub) return { id: claims.sub, email: claims.email ?? null };
  }
  return null;
}
