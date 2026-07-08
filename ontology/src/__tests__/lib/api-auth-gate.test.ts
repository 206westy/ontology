// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// C1 regression: /api/* must require authentication. Unauthenticated API
// requests get a 401 JSON (never a 302 redirect, which would break fetch).
const getUserMock = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: getUserMock } }),
}));

import { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

function req(path: string, cookie?: string) {
  return new NextRequest(new URL(`http://localhost${path}`), {
    headers: cookie ? { cookie } : undefined,
  });
}

describe('updateSession — /api auth gate (C1)', () => {
  beforeEach(() => getUserMock.mockReset());

  it('returns 401 JSON for unauthenticated /api requests', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const res = await updateSession(req('/api/classes'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('lets authenticated /api requests through (no 401, no redirect)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const res = await updateSession(req('/api/classes'));

    expect(res.status).not.toBe(401);
    expect(res.headers.get('location')).toBeNull();
  });

  it('handles unauthenticated page routes via redirect, not the 401 api gate', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const res = await updateSession(req('/some-protected-page'));

    expect(res.status).not.toBe(401);
  });
});

describe('updateSession — /api 검증 캐시 (PRD-M 후속)', () => {
  beforeEach(() => getUserMock.mockReset());

  it('같은 세션 쿠키의 재요청은 TTL 내 원격 재검증을 생략한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const cookie = 'sb-test-auth-token=cache-hit-token';

    const first = await updateSession(req('/api/classes', cookie));
    const second = await updateSession(req('/api/neo4j/push', cookie));

    expect(first.status).not.toBe(401);
    expect(second.status).not.toBe(401);
    expect(getUserMock).toHaveBeenCalledTimes(1);
  });

  it('미인증(401) 결과는 캐시하지 않고 매번 재검증한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const cookie = 'sb-test-auth-token=rejected-token';

    const first = await updateSession(req('/api/classes', cookie));
    const second = await updateSession(req('/api/classes', cookie));

    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(getUserMock).toHaveBeenCalledTimes(2);
  });

  it('쿠키가 다르면(다른 세션) 별도로 재검증한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    await updateSession(req('/api/classes', 'sb-test-auth-token=session-a'));
    await updateSession(req('/api/classes', 'sb-test-auth-token=session-b'));

    expect(getUserMock).toHaveBeenCalledTimes(2);
  });

  it('세션 쿠키가 없으면 캐시를 타지 않는다', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const res = await updateSession(req('/api/classes'));

    expect(res.status).toBe(401);
    expect(getUserMock).toHaveBeenCalledTimes(1);
  });

  it('TTL 이 지나면 원격 재검증으로 돌아간다', async () => {
    vi.useFakeTimers();
    try {
      getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      const cookie = 'sb-test-auth-token=ttl-expiry-token';

      await updateSession(req('/api/classes', cookie));
      vi.setSystemTime(Date.now() + 61_000);
      await updateSession(req('/api/classes', cookie));

      expect(getUserMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('페이지 라우트는 캐시 대상이 아니다 (항상 원격 검증)', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const cookie = 'sb-test-auth-token=page-route-token';

    await updateSession(req('/api/classes', cookie)); // 캐시 적재
    await updateSession(req('/some-page', cookie)); // 페이지는 생략 없이 검증

    expect(getUserMock).toHaveBeenCalledTimes(2);
  });
});
