import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { mergeRequests } from '@/lib/drizzle/schema';
import { eq } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';
import { getCurrentUser } from '@/lib/supabase/auth-server';
import { loadMergePlan } from '@/lib/merge-executor';

// PRD-J M3: MR 상세(병합 계획 미리보기 포함) + 리뷰 상태 전환.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = await getDb();

    const mr = await db.query.mergeRequests.findFirst({
      where: eq(mergeRequests.id, id),
      with: { branch: true },
    });
    if (!mr) {
      return NextResponse.json({ error: '병합 요청을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 병합 계획은 항상 라이브로 계산 — main 이 그 사이 움직였을 수 있다.
    const ctx = await loadMergePlan(db, mr.branchId);
    if ('error' in ctx) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    // base_snapshot 은 클라이언트에 불필요(무겁다) — 제외하고 반환.
    const { baseSnapshot: _bs, ...branchLight } = ctx.branch as Record<string, unknown> & {
      baseSnapshot: unknown;
    };

    return NextResponse.json({
      mergeRequest: mr,
      branch: branchLight,
      plan: ctx.plan,
      stats: {
        mine: ctx.mineCount,
        theirs: ctx.theirsCount,
        autoApply: ctx.plan.autoApply.length,
        conflicts: ctx.plan.conflicts.length,
        identical: ctx.plan.identical.length,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const patchMrSchema = z.object({
  status: z.enum(['approved', 'closed', 'open']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = patchMrSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = await getDb();
    const mr = await db.query.mergeRequests.findFirst({
      where: eq(mergeRequests.id, id),
      columns: { id: true, status: true },
    });
    if (!mr) {
      return NextResponse.json({ error: '병합 요청을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (mr.status === 'merged') {
      return NextResponse.json(
        { error: '이미 병합된 요청은 상태를 바꿀 수 없습니다.' },
        { status: 400 },
      );
    }

    const user = await getCurrentUser().catch(() => null);
    const isReview = parsed.data.status === 'approved';

    const [updated] = await db
      .update(mergeRequests)
      .set({
        status: parsed.data.status,
        ...(isReview
          ? {
              reviewerId: user?.id ?? null,
              reviewerEmail: user?.email ?? null,
              reviewedAt: new Date(),
            }
          : {}),
      })
      .where(eq(mergeRequests.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
