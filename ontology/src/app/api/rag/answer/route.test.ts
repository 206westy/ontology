import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const { generateTextMock, embedMock, sessionRunMock, executeReadMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  embedMock: vi.fn(),
  sessionRunMock: vi.fn(),
  executeReadMock: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  Output: { object: (x: unknown) => x },
}));
vi.mock('@ai-sdk/openai', () => ({ openai: () => 'mock-model' }));
vi.mock('@/features/ontology/lib/embedding', () => ({
  embedOne: (...args: unknown[]) => embedMock(...args),
}));
vi.mock('@/lib/neo4j/client', () => ({
  getNeo4jDriver: () => ({
    session: () => ({
      run: (...args: unknown[]) => sessionRunMock(...args),
      executeRead: (work: (tx: unknown) => unknown) => executeReadMock(work),
      close: async () => {},
    }),
  }),
}));

import { POST } from './route';

const P1 = '00000000-0000-0000-0000-000000000001';

function makeReq(body: unknown): NextRequest {
  return new Request('http://localhost/api/rag/answer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

// 탐색 레코드(nodes/edges 맵 투영) 헬퍼.
function pathRecord() {
  const nodes = [
    { id: 'a', name: 'Chamber', partition: 'P1', src: 'session_doc', srcRef: 'doc1', conf: 0.9, description: '식각 챔버' },
    { id: 'b', name: 'Pump', partition: 'P1', src: null, srcRef: null, conf: null, description: null },
  ];
  const edges = [{ type: 'CONTROLS', bridge: false }];
  return { get: (k: string) => (k === 'nodes' ? nodes : edges) };
}

describe('POST /api/rag/answer (PRD-N M4)', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    embedMock.mockReset();
    sessionRunMock.mockReset();
    executeReadMock.mockReset();
    embedMock.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  it('잘못된 요청 바디는 400', async () => {
    const res = await POST(makeReq({ noQuestion: 1 }));
    expect(res.status).toBe(400);
  });

  it('진입 개념이 없으면 "근거 없음"을 명시하고 LLM 미호출', async () => {
    sessionRunMock.mockResolvedValue({ records: [] }); // entry 없음
    const res = await POST(makeReq({ question: '무관한 질문', partitionId: P1 }));
    const data = await res.json();
    expect(data.grounded).toBe(false);
    expect(data.entryCount).toBe(0);
    expect(data.answer).toContain('근거');
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('진입+경로가 있으면 근거경로+출처를 붙여 답한다', async () => {
    sessionRunMock.mockResolvedValue({ records: [{ get: () => 'a' }] }); // entry id
    executeReadMock.mockImplementation((work: (tx: unknown) => unknown) =>
      work({ run: async () => ({ records: [pathRecord()] }) }),
    );
    generateTextMock.mockResolvedValue({
      output: { answer: '챔버가 펌프를 제어합니다', hasUngrounded: false },
    });

    const res = await POST(makeReq({ question: '챔버는 무엇을 제어하나?', partitionId: P1 }));
    const data = await res.json();
    expect(data.grounded).toBe(true);
    expect(data.answer).toContain('챔버');
    expect(data.paths).toHaveLength(1);
    expect(data.paths[0].nodes[0].name).toBe('Chamber');
    // 출처(src) 있는 노드는 sources 로.
    expect(data.sources.map((s: { name: string }) => s.name)).toContain('Chamber');
    expect(data.ungroundedNote).toBeNull();
  });

  it('LLM이 근거 부족을 표시하면 ungroundedNote 로 분리', async () => {
    sessionRunMock.mockResolvedValue({ records: [{ get: () => 'a' }] });
    executeReadMock.mockImplementation((work: (tx: unknown) => unknown) =>
      work({ run: async () => ({ records: [pathRecord()] }) }),
    );
    generateTextMock.mockResolvedValue({
      output: { answer: '부분 답변', hasUngrounded: true, ungroundedNote: '가격 정보는 모델에 없음' },
    });
    const res = await POST(makeReq({ question: '챔버 가격은?', partitionId: P1 }));
    const data = await res.json();
    expect(data.ungroundedNote).toContain('모델에');
  });
});
