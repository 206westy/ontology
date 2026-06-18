import { NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { handleApiError } from '@/lib/api-error';
import {
  assistRequestSchema,
  assistWireResponseSchema,
  ontologyActionSchema,
  type AssistWireAction,
  type OntologyAction,
} from '@/features/ontology/lib/schemas';

const SYSTEM_PROMPT = `당신은 온톨로지 설계 어시스턴트입니다. 사용자의 요청을 분석해
(1) 자연어 답변(reply)과 (2) 그래프에 적용할 구조화된 액션 목록(actions)을 생성합니다.

각 액션은 op과 label, 그리고 op에 필요한 필드만 채웁니다. 사용하지 않는 필드는 null로 둡니다.
op별 필요한 필드:
- add_class: name(필수), parentName?, description?, color?(#RRGGBB)
- add_property: className(필수), name(필수), dataType(필수: string|integer|float|boolean|date|enum), enumValues?(enum이면 필수), isRequired?
- add_instance: className(필수), name(필수)
- add_relation_type: name(필수), sourceClassName?, targetClassName?
- add_edge: relationTypeName(필수), sourceName(필수), targetName(필수)
- update_class: className(필수), description?, color?

규칙:
- label은 액션을 설명하는 짧은 한국어 문구(예: "ECOLITE 클래스 추가").
- 사용자가 명시적으로 요청한 변경만 액션으로 만든다. 추측으로 노드를 만들지 않는다.
- 단순 질문/설명 요청이면 actions는 빈 배열로 두고 reply만 채운다.
- reply 길이는 요청 복잡도에 맞춘다: 단순 질문/설명은 1~3문장, 복잡한 설계 요청만 상세히. 불필요하게 길게 늘리지 않는다.
- 존재하지 않는 부모/클래스를 참조하지 않는다. 필요한 상위 클래스가 없으면 그 add_class 액션도 함께 포함한다(순서대로).
- 사용하지 않는 모든 필드는 반드시 null로 채운다.
- reply는 한국어로 간결하게.`;

// Map a flat wire action into the discriminated OntologyAction shape.
// Returns null if required fields for the op are missing/invalid.
function toOntologyAction(w: AssistWireAction): OntologyAction | null {
  const has = (v: string | null | undefined): v is string => typeof v === 'string' && v.length > 0;
  let candidate: unknown;

  switch (w.op) {
    case 'add_class':
      candidate = {
        op: w.op,
        label: w.label,
        payload: {
          name: w.name,
          ...(has(w.parentName) ? { parentName: w.parentName } : {}),
          ...(has(w.description) ? { description: w.description } : {}),
          ...(has(w.color) ? { color: w.color } : {}),
        },
      };
      break;
    case 'add_property':
      candidate = {
        op: w.op,
        label: w.label,
        payload: {
          className: w.className,
          name: w.name,
          dataType: w.dataType,
          ...(w.enumValues ? { enumValues: w.enumValues } : {}),
          ...(typeof w.isRequired === 'boolean' ? { isRequired: w.isRequired } : {}),
        },
      };
      break;
    case 'add_instance':
      candidate = {
        op: w.op,
        label: w.label,
        payload: { className: w.className, name: w.name },
      };
      break;
    case 'add_relation_type':
      candidate = {
        op: w.op,
        label: w.label,
        payload: {
          name: w.name,
          ...(has(w.sourceClassName) ? { sourceClassName: w.sourceClassName } : {}),
          ...(has(w.targetClassName) ? { targetClassName: w.targetClassName } : {}),
        },
      };
      break;
    case 'add_edge':
      candidate = {
        op: w.op,
        label: w.label,
        payload: {
          relationTypeName: w.relationTypeName,
          sourceName: w.sourceName,
          targetName: w.targetName,
        },
      };
      break;
    case 'update_class':
      candidate = {
        op: w.op,
        label: w.label,
        payload: {
          className: w.className,
          ...(has(w.description) ? { description: w.description } : {}),
          ...(has(w.color) ? { color: w.color } : {}),
        },
      };
      break;
    default:
      return null;
  }

  const parsed = ontologyActionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

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
      schema: assistWireResponseSchema,
      system: SYSTEM_PROMPT,
      prompt,
      // assist는 증분 편집 전용 — 가볍고 빠르게 (PATCH-1).
      // 대량 일괄 생성은 parse(가져오기) 경로로 유도(PATCH-2).
      providerOptions: { openai: { reasoningEffort: 'low', textVerbosity: 'low' } },
      maxOutputTokens: 6000,
    });

    const actions = result.object.actions
      .map(toOntologyAction)
      .filter((a): a is OntologyAction => a !== null);

    return NextResponse.json({ reply: result.object.reply, actions });
  } catch (err) {
    return handleApiError(err);
  }
}
