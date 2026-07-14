import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { functions } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';
import { astNodeSchema } from '@/lib/functions/ast';
import { functionInputSchema, outputSpecSchema } from '@/lib/functions/evaluate';
import {
  spcFunctionLogicSchema,
  fdcFunctionLogicSchema,
} from '@/lib/functions/stats-config';

// GET /api/functions — 현재 온톨로지의 결정함수 목록.
export async function GET(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request);
    const db = await getDb();
    const rows = await db.query.functions.findMany({
      where: eq(functions.ontologyId, ontologyId),
      orderBy: (f, { desc }) => [desc(f.createdAt)],
    });
    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

// impl_type 별 logic 검증 — ast=화이트리스트 AST, spc/fdc=통계엔진 호출 매핑(계산식 없음).
const baseSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  targetClassId: z.string().uuid().nullable().optional(),
  inputs: z.array(functionInputSchema).default([]),
  nlSource: z.string().max(2000).optional(),
  status: z.enum(['draft', 'confirmed']).optional(),
  implType: z.enum(['ast', 'spc', 'fdc']).default('ast'),
  logic: z.unknown(),
  outputSpec: z.unknown().optional(),
});

// SPC/FDC 판정은 pass/warn/fail 3상 — output_spec 은 pass_fail 로 고정(verdict 은 엔진이 산출).
const STATS_OUTPUT_SPEC = { kind: 'pass_fail' as const };

function validateLogicByImpl(
  implType: 'ast' | 'spc' | 'fdc',
  logic: unknown,
  outputSpec: unknown,
): { logic: unknown; outputSpec: unknown } | { error: unknown } {
  if (implType === 'ast') {
    const l = astNodeSchema.safeParse(logic);
    if (!l.success) return { error: l.error.flatten() };
    const o = outputSpecSchema.safeParse(outputSpec);
    if (!o.success) return { error: o.error.flatten() };
    return { logic: l.data, outputSpec: o.data };
  }
  const schema = implType === 'spc' ? spcFunctionLogicSchema : fdcFunctionLogicSchema;
  const l = schema.safeParse(logic);
  if (!l.success) return { error: l.error.flatten() };
  return { logic: l.data, outputSpec: STATS_OUTPUT_SPEC };
}

// POST /api/functions — 결정함수 생성(AST=화이트리스트 검증 / SPC·FDC=엔진 호출 매핑 검증).
export async function POST(request: NextRequest) {
  try {
    const { ontologyId, userId } = await getOntologyScope(request, 'editor');
    const body = await request.json();
    const parsed = baseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const validated = validateLogicByImpl(
      parsed.data.implType,
      parsed.data.logic,
      parsed.data.outputSpec,
    );
    if ('error' in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const db = await getDb();
    const [row] = await db
      .insert(functions)
      .values({
        ontologyId,
        name: parsed.data.name,
        description: parsed.data.description ?? '',
        targetClassId: parsed.data.targetClassId ?? null,
        inputs: parsed.data.inputs,
        implType: parsed.data.implType,
        logic: validated.logic,
        outputSpec: validated.outputSpec,
        nlSource: parsed.data.nlSource ?? null,
        status: parsed.data.status ?? 'draft',
        createdBy: userId,
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
