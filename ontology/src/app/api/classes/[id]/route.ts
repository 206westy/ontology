import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { classes } from '@/lib/drizzle/schema';
import { updateClassSchema } from '@/features/ontology/lib/schemas';
import { eq, sql } from 'drizzle-orm';
import { omit } from 'es-toolkit';
import { handleApiError } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const db = await getDb();
    // PRD-Perf M0-1: embedding 은 서버 전용 — 본체·연관 행 모두 응답에서 제외.
    const row = await db.query.classes.findFirst({
      where: eq(classes.id, id),
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

    const db = await getDb();
    // PRD-E P2-2: name/description 변경 시 임베딩 무효화 → 워커가 재생성.
    const invalidateEmbedding =
      parsed.data.name !== undefined || parsed.data.description !== undefined;
    const [row] = await db
      .update(classes)
      .set({
        ...parsed.data,
        ...(invalidateEmbedding ? { embedding: null } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(classes.id, id))
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

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const db = await getDb();
    const [row] = await db
      .delete(classes)
      .where(eq(classes.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
