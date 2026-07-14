import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';
import { evaluateSpc } from '@/lib/spc';

// PRD-PF-F M1: SPC 통계 엔진 인터페이스(순수 계산, DB 미적재 — 미리보기/AI초안 검증용).
// ★역할 경계★: 통계 계산은 오직 이 엔진 경로에서만. 그래프/Cypher/Function 정의에 통계식 금지.
const requestSchema = z.object({
  chartType: z.enum(['xbar_r', 'i_mr', 'p', 'np', 'c', 'u']),
  subgroups: z.array(z.array(z.number())).optional(),
  values: z.array(z.number()).optional(),
  attribute: z
    .array(z.object({ count: z.number(), size: z.number().positive() }))
    .optional(),
  spec: z
    .object({
      usl: z.number().nullable().optional(),
      lsl: z.number().nullable().optional(),
      target: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  rulesEnabled: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    await getOntologyScope(request); // 인증 스코프(계산 전용, 쓰기 없음)
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const result = evaluateSpc(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
