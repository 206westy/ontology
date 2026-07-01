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

function req(path: string) {
  return new NextRequest(new URL(`http://localhost${path}`));
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
