import { describe, it, expect, vi, beforeEach } from 'vitest';

// AI SDK 모킹: generateText 는 canned 이름을 돌려주고, Output.object 는 통과.
const { generateTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn() }));
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  Output: { object: (x: unknown) => x },
}));
vi.mock('@ai-sdk/openai', () => ({ openai: () => 'mock-model' }));

import { POST } from './route';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/llm/partition/suggest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const semiconductorNodes = [
  { id: 'c1', name: 'Chuck', kind: 'class' },
  { id: 'c2', name: 'Wafer', kind: 'class' },
  { id: 'i1', name: '펌프447', kind: 'instance' },
];

describe('POST /api/llm/partition/suggest', () => {
  beforeEach(() => generateTextMock.mockReset());

  it('잘못된 요청 바디는 400', async () => {
    const res = await POST(makeReq({ entities: 'not-an-array' }));
    expect(res.status).toBe(400);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('attach 는 LLM 을 호출하지 않는다(무소음)', async () => {
    const res = await POST(
      makeReq({
        entities: [{ name: 'Chuck' }, { name: 'Wafer' }],
        currentPartitionNodes: semiconductorNodes,
      }),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.decision).toBe('attach');
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it('new 는 LLM 명명 결과(이름+근거)를 반환한다', async () => {
    generateTextMock.mockResolvedValue({
      output: { suggestedPartitionName: '행정', rationale: '결재·품의 등 행정 도메인' },
    });
    const res = await POST(
      makeReq({
        entities: [{ name: '결재문서' }, { name: '품의서' }, { name: '전자서명' }],
        currentPartitionNodes: semiconductorNodes,
        partitionsSummary: [{ id: 'p1', name: '반도체' }],
      }),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.decision).toBe('new');
    expect(data.suggestedPartitionName).toBe('행정');
    expect(data.rationale).toContain('행정');
    expect(generateTextMock).toHaveBeenCalledOnce();
  });

  it('bridge 는 새 구획 이름 + bridge 후보를 반환한다', async () => {
    generateTextMock.mockResolvedValue({
      output: { suggestedPartitionName: '구매', rationale: '구매·예산 프로세스' },
    });
    const res = await POST(
      makeReq({
        entities: [{ name: '펌프447' }, { name: '구매요청' }, { name: '예산' }, { name: '결재라인' }],
        currentPartitionNodes: semiconductorNodes,
      }),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.decision).toBe('bridge');
    expect(data.bridges).toHaveLength(1);
    expect(data.bridges[0].targetId).toBe('i1');
  });

  it('LLM 무효 응답 시 결정론 결과 + fallback 이름을 유지한다', async () => {
    generateTextMock.mockResolvedValue({ output: null });
    const res = await POST(
      makeReq({
        entities: [{ name: '결재문서' }, { name: '품의서' }, { name: '전자서명' }],
        currentPartitionNodes: semiconductorNodes,
      }),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.decision).toBe('new');
    expect(data.suggestedPartitionName).toBeTruthy();
  });
});
