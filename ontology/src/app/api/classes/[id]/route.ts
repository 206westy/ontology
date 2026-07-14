import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { classes } from '@/lib/drizzle/schema';
import { updateClassSchema } from '@/features/ontology/lib/schemas';
import { eq, and, sql } from 'drizzle-orm';
import { omit } from 'es-toolkit';
import { handleApiError } from '@/lib/api-error';
import { getOntologyScope } from '@/lib/authz/ontologyContext';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const { ontologyId } = await getOntologyScope(request);
    const db = await getDb();
    // PRD-Perf M0-1: embedding 은 서버 전용 — 본체·연관 행 모두 응답에서 제외.
    const row = await db.query.classes.findFirst({
      where: and(eq(classes.id, id), eq(classes.ontologyId, ontologyId)),
      columns: { embedding: false },
      with: {
        children: { columns: { embedding: false } },
        properties: { orderBy: (p, { asc }) => [asc(p.sortOrder)] },
        instances: { columns: { embedding: false } },
        parent: { columns: { embedding: false } },
      },
    });

    if (!row) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const body = await request.json();
    const parsed = updateClassSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { ontologyId } = await getOntologyScope(request, 'editor');
    const db = await getDb();
    // PRD-E P2-2 + PRD-Perf M3-1: 임베딩 텍스트(name/description)가 "실제로 바뀔 때만"
    // 무효화 → 워커가 재생성. 같은 값 재저장(autosave 등)은 재임베딩을 유발하지 않는다.
    // IS DISTINCT FROM 비교를 UPDATE 안에서 수행해 추가 왕복 없이 판정한다.
    const nameProvided = parsed.data.name !== undefined;
    const descProvided = parsed.data.description !== undefined;
    const textChanged = sql`(${nameProvided ? sql`${classes.name} IS DISTINCT FROM ${parsed.data.name}` : sql`false`} OR ${descProvided ? sql`${classes.description} IS DISTINCT FROM ${parsed.data.description}` : sql`false`})`;
    const [row] = await db
      .update(classes)
      .set({
        ...parsed.data,
        ...(nameProvided || descProvided
          ? { embedding: sql`CASE WHEN ${textChanged} THEN NULL ELSE ${classes.embedding} END` }
          : {}),
        updatedAt: sql`now()`,
      })
      .where(and(eq(classes.id, id), eq(classes.ontologyId, ontologyId)))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    // PRD-Perf M0-1: returning() 은 전 컬럼 반환 — 서버 전용 embedding 벡터는 응답에서 제거.
    return NextResponse.json(omit(row, ['embedding']));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const { ontologyId } = await getOntologyScope(request, 'editor');
    const db = await getDb();
    const [row] = await db
      .delete(classes)
      .where(and(eq(classes.id, id), eq(classes.ontologyId, ontologyId)))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
