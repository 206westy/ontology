import { NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { handleApiError } from '@/lib/api-error';
import {
  assistRequestSchema,
  assistantActionResponseSchema,
} from '@/features/ontology/lib/schemas';

const SYSTEM_PROMPT = `당신은 온톨로지 설계 어시스턴트입니다. 사용자의 요청을 분석해
(1) 자연어 답변(reply)과 (2) 그래프에 적용할 구조화된 액션 목록(actions)을 생성합니다.

액션은 이름 기반(name-based)입니다. 가능한 op:
- add_class: { name, parentName?, description?, color? }  (color는 #RRGGBB)
- add_property: { className, name, dataType, enumValues?, isRequired? }  (dataType: string|integer|float|boolean|date|enum, enum이면 enumValues 필수)
- add_instance: { className, name }
- add_relation_type: { name, sourceClassName?, targetClassName? }
- add_edge: { relationTypeName, sourceName, targetName }
- update_class: { className, description?, color? }

규칙:
- label은 액션을 설명하는 짧은 한국어 문구(예: "ECOLITE 클래스 추가").
- 사용자가 명시적으로 요청한 변경만 액션으로 만든다. 추측으로 노드를 만들지 않는다.
- 단순 질문/설명 요청이면 actions는 빈 배열로 두고 reply만 채운다.
- 존재하지 않는 부모/클래스를 참조하지 않는다. 필요한 상위 클래스가 없으면 그 add_class 액션도 함께 포함한다(순서대로).
- reply는 한국어로 간결하게.`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = assistRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { message, selectedNodeId, ontologySummary } = parsed.data;

    const prompt = `현재 온톨로지 요약:
${ontologySummary || '(비어 있음)'}
${selectedNodeId ? `\n현재 선택된 노드 id: ${selectedNodeId}` : ''}

사용자 요청:
${message}`;

    const result = await generateObject({
      model: openai('gpt-5.4-mini'),
      schema: assistantActionResponseSchema,
      system: SYSTEM_PROMPT,
      prompt,
    });

    return NextResponse.json(result.object);
  } catch (err) {
    return handleApiError(err);
  }
}
