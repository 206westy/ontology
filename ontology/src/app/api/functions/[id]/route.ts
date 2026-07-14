import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
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

// logic 은 함수의 기존 impl_type 에 맞춰 검증(impl_type 자체는 생성 후 불변).
const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  targetClassId: z.string().uuid().nullable().optional(),
  inputs: z.array(functionInputSchema).optional(),
  logic: z.unknown().optional(),
  outputSpec: outputSpecSchema.optional(),
  // 완전 자동 금지: 초안→확정 승격은 사람 컨펌으로만(여기 status 갱신).
  status: z.enum(['draft', 'confirmed', 'archived']).optional(),
});

function logicSchemaFor(implType: string) {
  if (implType === 'spc') return spcFunctionLogicSchema;
  if (implType === 'fdc') return fdcFunctionLogicSchema;
  return astNodeSchema;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ontologyId } = await getOntologyScope(request, 'editor');
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = await getDb();
    const existing = await db.query.functions.findFirst({
      where: and(eq(functions.id, id), eq(functions.ontologyId, ontologyId)),
    });
    if (!existing) {
      return NextResponse.json({ error: '함수를 찾을 수 없습니다.' }, { status: 404 });
    }

    const patch: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
    if (parsed.data.logic !== undefined) {
      const validated = logicSchemaFor(existing.implType).safeParse(parsed.data.logic);
      if (!validated.success) {
        return NextResponse.json({ error: validated.error.flatten() }, { status: 400 });
      }
      patch.logic = validated.data;
    }

    const [row] = await db
      .update(functions)
      .set(patch)
      .where(and(eq(functions.id, id), eq(functions.ontologyId, ontologyId)))
      .returning();
    return NextResponse.json(row);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ontologyId } = await getOntologyScope(request, 'editor');
    const db = await getDb();
    const [row] = await db
      .delete(functions)
      .where(and(eq(functions.id, id), eq(functions.ontologyId, ontologyId)))
      .returning();
    if (!row) {
      return NextResponse.json({ error: '함수를 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
