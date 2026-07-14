import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getDb } from '@/lib/drizzle';
import { summaries } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';
import { LLM_MODELS, LLM_MAX_RETRIES } from '@/lib/llm/models';

// PRD-PF-H M3: 전역 검색(사센스메이킹). 구획 요약 map-reduce 로 종합, 근거 구획 인용.
// 읽기전용. 근거(요약) 없으면 "모델에 근거 없음". 소비 표면은 그래프를 변경하지 않는다.
const requestSchema = z.object({
  question: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

export async function POST(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const db = await getDb();
    const rows = await db.query.summaries.findMany({
      where: eq(summaries.ontologyId, ontologyId),
      columns: { partitionId: true, summary: true, stale: true },
      limit: parsed.data.limit,
    });

    if (rows.length === 0) {
      return NextResponse.json({
        answer: '구획 요약이 아직 없습니다. 모델에 근거가 없습니다. (요약 재생성 필요)',
        sources: [],
        grounded: false,
      });
    }

    // map: 각 구획 요약을 근거 후보로 라벨링. reduce: 한 번의 종합(근거 구획 인용).
    const context = rows
      .map((r, i) => `[P${i + 1} · ${r.partitionId}] ${r.summary}`)
      .join('\n');

    let answer = '';
    try {
      const result = await generateText({
        model: openai(LLM_MODELS.primary),
        providerOptions: { openai: { reasoningEffort: 'low', textVerbosity: 'low' } },
        maxOutputTokens: 1200,
        maxRetries: LLM_MAX_RETRIES,
        system:
          '여러 구획 요약을 종합해 전역 질문에 답한다. 오직 제공된 요약만 근거로 쓰고, 문장마다 [P#] 로 인용하라. 요약에 없으면 "모델에 근거 없음"이라고 하라. 간결한 한국어.',
        prompt: `질문: ${parsed.data.question}\n\n구획 요약:\n${context}`,
      });
      answer = result.text?.trim() || '답변 생성 실패(근거 요약은 아래 참조).';
    } catch {
      answer = '답변 생성에 실패했지만 아래 근거 구획을 확인할 수 있습니다.';
    }

    return NextResponse.json({
      answer,
      sources: rows.map((r, i) => ({ tag: `P${i + 1}`, partitionId: r.partitionId, stale: r.stale })),
      grounded: true,
      staleSources: rows.some((r) => r.stale),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
