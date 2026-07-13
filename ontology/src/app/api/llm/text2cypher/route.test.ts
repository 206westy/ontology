import { describe, it, expect, vi, beforeEach } from 'vitest';

// AI SDK + Neo4j 클라이언트 모킹. generateText 는 인자를 캡처해 시스템 프롬프트를 검증한다.
const { generateTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn() }));
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  tool: (def: unknown) => def,
  stepCountIs: (n: number) => n,
  zodSchema: (s: unknown) => s,
}));
vi.mock('@ai-sdk/openai', () => ({ openai: () => 'mock-model' }));
// 스키마 조회는 try/catch 로 폴백되므로 driver 가 throw 해도 라우트는 진행된다.
vi.mock('@/lib/neo4j/client', () => ({
  getNeo4jDriver: () => {
    throw new Error('no neo4j in test');
  },
}));

import type { NextRequest } from 'next/server';
import { POST } from './route';

const P2 = '00000000-0000-0000-0000-000000000002';

function makeReq(body: unknown): NextRequest {
  return new Request('http://localhost/api/llm/text2cypher', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('POST /api/llm/text2cypher — 구획 스코프 (PRD-N M2)', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    generateTextMock.mockResolvedValue({ text: 'MATCH (n) RETURN n', steps: [] });
  });

  it('잘못된 요청 바디는 400', async () => {
    const res = await POST(makeReq({ notQuestion: 1 }));
    expect(res.status).toBe(400);
  });

  it('partitionId 지정(전체질의 아님) → 프롬프트에 스코프 지시 + scoped=true', async () => {
    const res = await POST(makeReq({ question: '장비 보여줘', partitionId: P2 }));
    const data = await res.json();
    expect(data.scoped).toBe(true);
    const callArgs = generateTextMock.mock.calls[0][0] as { system: string };
    expect(callArgs.system).toContain('PARTITION SCOPE');
    expect(callArgs.system).toContain('$partition');
    // 실제 UUID 는 프롬프트에 하드코딩되지 않는다(서버 바인딩).
    expect(callArgs.system).not.toContain(P2);
  });

  it('스코프 미지정 → 스코프 지시 없음 + scoped=false (기존 동작 보존)', async () => {
    const res = await POST(makeReq({ question: '전체 보여줘' }));
    const data = await res.json();
    expect(data.scoped).toBe(false);
    const callArgs = generateTextMock.mock.calls[0][0] as { system: string };
    expect(callArgs.system).not.toContain('PARTITION SCOPE');
  });

  it('allPartitions=true 면 partitionId 있어도 무스코프(전체 질의 opt-in)', async () => {
    const res = await POST(makeReq({ question: 'q', partitionId: P2, allPartitions: true }));
    const data = await res.json();
    expect(data.scoped).toBe(false);
    const callArgs = generateTextMock.mock.calls[0][0] as { system: string };
    expect(callArgs.system).not.toContain('PARTITION SCOPE');
  });
});
