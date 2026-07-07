import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { instances } from '@/lib/drizzle/schema';
import { updateInstanceSchema } from '@/features/ontology/lib/schemas';
import { eq, sql } from 'drizzle-orm';
import { omit } from 'es-toolkit';
import { handleApiError } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    const body = await request.json();
    const parsed = updateInstanceSchema.safeParse(body);

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
      .update(instances)
      .set({
        ...parsed.data,
        ...(invalidateEmbedding ? { embedding: null } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(instances.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
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
      .delete(instances)
      .where(eq(instances.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
