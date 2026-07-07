import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { LLM_MODELS } from '@/lib/llm/models';
import {
  suggestGovernanceRequestSchema,
  suggestGovernanceResponseSchema,
} from '@/features/ontology/lib/schemas';
import { handleApiError } from '@/lib/api-error';

// PRD-E P2-7: 거버넌스 제안 레이어 (HITL). 텍스트 근거가 있을 때만 제약/공리/필수/enum/
// cardinality 를 **제안**한다. 자동 적용 금지 — 사용자 승인 시에만 반영된다.
const SYSTEM_PROMPT = `너는 온톨로지 거버넌스 보조기다. 도메인 텍스트와 기존 스키마를 보고, 텍스트에 **명시적 근거가 있을 때만** 거버넌스 요소를 제안한다.

제안 종류(kind):
- constraint_cardinality: "장비는 반드시 1개 이상 Site에 위치" 류 → targetClass/relationType + min/maxCardinality.
- constraint_disjoint: "DryAsher와 WetStation은 배타적" → targetClass + disjointWith.
- constraint_domain_range: 관계의 소스/타겟 클래스 제한 → relationType + targetClass.
- constraint_property_value: 값 범위/패턴 제약 → targetClass/property + (min/max 또는 enumValues).
- property_required: 누락이 드문(항상 채워지는) 프로퍼티 → targetClass + property.
- property_enum: 값이 정해진 집합에서 나오는 프로퍼티 → targetClass + property + enumValues.
- edge_cardinality: 관계 다중성 추정 → relationType + min/maxCardinality.
- axiom: 자유서술 규칙(설명 메모) 제안 → axiomLogic(한 줄 규칙 표현). 승인 시 constraints(kind='memo')로 기록된다.

엄격 규칙:
- 근거 없는 제안 금지. 추측·환각 금지. 애매하면 제안하지 않는다(빈 배열 허용).
- 각 제안에 evidence(원문 근거 스팬)와 confidence(0~1)를 반드시 채운다.
- 해당 없는 필드는 null. title 과 evidence 는 한국어.
- 이것은 제안일 뿐 자동 적용되지 않는다.`;

export async function POST(request: NextRequest) {
  try {
    const parsed = suggestGovernanceRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { text, schemaContext } = parsed.data;

    const prompt = `도메인 텍스트:
"""
${text}
"""
${schemaContext ? `\n기존 스키마:\n${schemaContext}` : ''}

위 텍스트에 근거가 있는 거버넌스 요소만 제안하라.`;

    const result = await generateObject({
      model: openai(LLM_MODELS.primary),
      schema: suggestGovernanceResponseSchema,
      system: SYSTEM_PROMPT,
      prompt,
      providerOptions: { openai: { reasoningEffort: 'medium', textVerbosity: 'low' } },
      maxOutputTokens: 8000,
    });

    return NextResponse.json(result.object);
  } catch (err) {
    return handleApiError(err);
  }
}
