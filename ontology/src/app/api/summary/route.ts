import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { summaries } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';

// GET /api/summary — 구획 요약 목록(임베딩 제외, 목록/신선도용).
export async function GET(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request);
    const db = await getDb();
    const rows = await db.query.summaries.findMany({
      where: eq(summaries.ontologyId, ontologyId),
      columns: { id: true, partitionId: true, summary: true, stale: true, criticHealth: true, updatedAt: true },
    });
    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/summary/mark-stale 대체: PATCH 로 dirty 마킹(커밋 훅/수동). 전량 재계산 방지의 반대 축.
const patchSchema = z.object({ partitionIds: z.array(z.string().uuid()).min(1) });

export async function PATCH(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request, 'editor');
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const db = await getDb();
    // 지정 구획만 dirty 마킹(온톨로지 스코프 내 — 교차 방지).
    await db
      .update(summaries)
      .set({ stale: true, updatedAt: new Date() })
      .where(
        and(
          eq(summaries.ontologyId, ontologyId),
          inArray(summaries.partitionId, parsed.data.partitionIds),
        ),
      );
    return NextResponse.json({ marked: parsed.data.partitionIds.length });
  } catch (err) {
    return handleApiError(err);
  }
}
