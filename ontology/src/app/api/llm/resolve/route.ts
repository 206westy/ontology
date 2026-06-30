import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import {
  dedupResolveRequestSchema,
  dedupResolveResponseSchema,
} from '@/features/ontology/lib/schemas';
import { handleApiError } from '@/lib/api-error';

const SYSTEM_PROMPT = `너는 온톨로지 중복 판정기다. 새 항목과 기존 후보들을 보고 하나의 결정을 내린다.

결정 종류:
- reuse: 새 항목이 후보와 **같은 개념**이다 → 기존 노드를 재사용(생성 안 함). targetId 필수.
- relate: 같은 개념은 아니지만 **관계가 있다**(예: 부품과 그 부품의 속성). targetId + relationType 제시.
- possible_duplicate: 동의어/표기 흔들림으로 **사람이 확인 필요**. targetId 제시.
- new: 후보와 무관한 새 개념 → 새로 생성.

엄격 규칙:
- 이름이 비슷해도 **종류가 다르면 동일이 아니다**. 예: 부품 "Chuck"(장비 부품) vs 파라미터 "Chuck 온도"(공정 값) → reuse 아님, relate 또는 new.
- 근거가 약하면 보수적으로 new 또는 possible_duplicate.
- confidence(0~1)와 한국어 reason을 항상 제시.`;

// PRD-E P2-4: 후보 → LLM 판정 (자동 병합 금지, 제안만).
export async function POST(request: NextRequest) {
  try {
    const parsed = dedupResolveRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { input, candidates, schemaContext } = parsed.data;

    // 임계치 가드: 후보 없으면 LLM 호출 없이 new.
    if (candidates.length === 0) {
      return NextResponse.json({
        decision: 'new',
        targetId: null,
        relationType: null,
        confidence: 0.9,
        reason: '유사 후보가 없습니다.',
      });
    }

    const candidateLines = candidates
      .map(
        (c) =>
          `- id=${c.id} | ${c.kind} | "${c.name}" | vec=${c.vectorScore?.toFixed(3) ?? '-'} trgm=${c.trigramScore?.toFixed(3) ?? '-'}`,
      )
      .join('\n');

    const prompt = `새 항목:
- 이름: ${input.name}
- 종류(추정): ${input.type ?? '(미상)'}
- 설명: ${input.description ?? '(없음)'}

기존 후보(유사도 점수 포함):
${candidateLines}
${schemaContext ? `\n온톨로지 맥락:\n${schemaContext}` : ''}

위 새 항목에 대해 하나의 결정을 내려라.`;

    const result = await generateObject({
      model: openai('gpt-5.4-mini'),
      schema: dedupResolveResponseSchema,
      system: SYSTEM_PROMPT,
      prompt,
      providerOptions: { openai: { reasoningEffort: 'low', textVerbosity: 'low' } },
      maxOutputTokens: 2000,
    });

    return NextResponse.json(result.object);
  } catch (err) {
    return handleApiError(err);
  }
}
