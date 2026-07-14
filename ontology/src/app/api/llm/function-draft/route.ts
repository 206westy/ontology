import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { LLM_MODELS } from '@/lib/llm/models';
import { getDb } from '@/lib/drizzle';
import { classes, properties } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';
import { astNodeSchema, collectVarNames } from '@/lib/functions/ast';
import { outputSpecSchema } from '@/lib/functions/evaluate';

// PRD-PF-B M3: 자연어 규칙 → 선언적 조건식(AST) 초안. 저장 아님 — 컨펌카드로 렌더 후 사람 승인.
const reqSchema = z.object({
  nl: z.string().min(1).max(1000),
  targetClassId: z.string().uuid(),
});

const draftSchema = z.object({
  name: z.string(),
  inputs: z.array(z.object({ propertyName: z.string(), alias: z.string() })),
  logic: astNodeSchema,
  outputSpec: outputSpecSchema,
  rationale: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request);
    const body = await request.json();
    const parsed = reqSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = await getDb();
    const cls = await db.query.classes.findFirst({
      where: and(
        eq(classes.id, parsed.data.targetClassId),
        eq(classes.ontologyId, ontologyId),
      ),
    });
    if (!cls) {
      return NextResponse.json({ error: '대상 클래스를 찾을 수 없습니다.' }, { status: 404 });
    }
    const props = await db.query.properties.findMany({
      where: and(
        eq(properties.classId, parsed.data.targetClassId),
        eq(properties.ontologyId, ontologyId),
      ),
    });

    const propList =
      props.map((p) => `- ${p.name} (${p.dataType})`).join('\n') || '(속성 없음)';
    const system = `너는 온톨로지 결정함수 저작 보조자다. 자연어 규칙을 선언적 AST 조건식 "초안"으로 변환한다(저장 아님, 사람이 컨펌).
규칙:
- 대상 클래스 "${cls.name}" 의 속성만 var 로 참조한다. var.name 은 아래 속성명을 그대로 쓴다.
- 코드/함수 호출/네트워크 금지. 화이트리스트 연산자(비교 > >= < <= == !=, 논리 and/or/not, 산술 + - * / %)만 사용.
- inputs 에는 logic 이 참조하는 속성을 {propertyName, alias} 로 나열(alias 는 속성명과 동일 권장).
- outputSpec: 통과/불통과 판정=pass_fail, 수치 점수=score, 라벨 추천=recommend.
- 근거 없거나 애매하면 가장 단순·보수적인 조건으로. 판단 근거를 rationale(한국어)에 적는다.
사용 가능한 속성:
${propList}`;

    const result = await generateObject({
      model: openai(LLM_MODELS.mini),
      schema: draftSchema,
      system,
      prompt: `자연어 규칙: ${parsed.data.nl}`,
      temperature: 0.1,
    });

    // Critic-lite: 조건이 참조하는 var 가 실제 속성/제안 입력에 매칭되는지 사전 검증(HITL 보조).
    const draft = result.object;
    const propByName = new Map(props.map((p) => [p.name, p.id]));
    const inputsResolved = draft.inputs.map((inp) => ({
      alias: inp.alias,
      propertyName: inp.propertyName,
      propertyId: propByName.get(inp.propertyName) ?? null,
    }));
    const warnings: string[] = [];
    for (const varName of collectVarNames(draft.logic)) {
      const matched = draft.inputs.find(
        (inp) => inp.alias === varName || inp.propertyName === varName,
      );
      if (!matched) {
        warnings.push(`조건이 참조하는 "${varName}" 에 대응하는 입력이 없습니다.`);
      } else if (!propByName.has(matched.propertyName)) {
        warnings.push(
          `속성 "${matched.propertyName}" 이 클래스 "${cls.name}" 에 없습니다(철자·단위 확인).`,
        );
      }
    }

    return NextResponse.json({
      draft: { ...draft, inputsResolved, targetClassId: cls.id, nlSource: parsed.data.nl },
      warnings,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
