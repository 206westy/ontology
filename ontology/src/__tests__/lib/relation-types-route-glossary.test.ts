import { describe, it, expect, vi, beforeEach } from 'vitest';

// PRD-L M6 (L7): relation-types POST 초크포인트가 생성 성공 후 어휘집에 기록하는지
// 모킹 수준에서 검증. getDb·recordRelationTerm 을 대체해 라우트 배선만 확인한다.
vi.mock('@/lib/relation-glossary', () => ({
  recordRelationTerm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/drizzle', () => ({
  getDb: vi.fn().mockResolvedValue({
    insert: () => ({
      values: () => ({
        returning: () =>
          Promise.resolve([{ id: 'rt-1', name: 'causes', layer: 'kinetic' }]),
      }),
    }),
  }),
}));

import { POST } from '@/app/api/relation-types/route';
import { recordRelationTerm } from '@/lib/relation-glossary';

describe('relation-types POST → 관계 어휘집 기록', () => {
  beforeEach(() => {
    vi.mocked(recordRelationTerm).mockClear();
  });

  it('생성 성공 후 recordRelationTerm 을 sourceRef=api 로 호출한다', async () => {
    const req = new Request('http://localhost/api/relation-types', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'causes', layer: 'kinetic' }),
    });

    const res = await POST(req as never);

    expect(res.status).toBe(201);
    expect(recordRelationTerm).toHaveBeenCalledTimes(1);
    expect(recordRelationTerm).toHaveBeenCalledWith(expect.anything(), {
      name: 'causes',
      layer: 'kinetic',
      sourceRef: 'api',
    });
  });

  it('검증 실패(빈 name)면 recordRelationTerm 을 호출하지 않는다', async () => {
    const req = new Request('http://localhost/api/relation-types', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });

    const res = await POST(req as never);

    expect(res.status).toBe(400);
    expect(recordRelationTerm).not.toHaveBeenCalled();
  });
});
