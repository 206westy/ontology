import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { branches, commits, commitDetails, mergeRequests } from '@/lib/drizzle/schema';
import { eq } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';
import { getCurrentUser } from '@/lib/supabase/auth-server';
import {
  loadMergePlan,
  applyNetChangesToMain,
  latestMainCommitId,
} from '@/lib/merge-executor';
import { applyResolutions } from '@/features/ontology/lib/merge-diff';

// PRD-J M3: 병합 실행.
// 1) 3-way 계획 계산 → 2) 해소 반영, 미해소 충돌 있으면 409 →
// 3) 단일 트랜잭션: main 엔티티 적용 + 병합 커밋(main, details=적용 델타) +
//    브랜치 merged + MR merged.
// 병합 커밋은 미반영(unpushed) 상태로 남아 기존 push 흐름으로 Neo4j 에 발행된다.
const mergeSchema = z.object({
  resolutions: z
    .array(
      z.object({
        key: z.string().min(1),
        choice: z.enum(['mine', 'theirs']),
      }),
    )
    .optional()
    .default([]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = mergeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = await getDb();
    const mr = await db.query.mergeRequests.findFirst({
      where: eq(mergeRequests.id, id),
    });
    if (!mr) {
      return NextResponse.json({ error: '병합 요청을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (mr.status === 'merged') {
      return NextResponse.json({ error: '이미 병합되었습니다.' }, { status: 400 });
    }
    if (mr.status === 'closed') {
      return NextResponse.json({ error: '닫힌 병합 요청입니다.' }, { status: 400 });
    }

    const ctx = await loadMergePlan(db, mr.branchId);
    if ('error' in ctx) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }
    if (ctx.branch.status !== 'active') {
      return NextResponse.json(
        { error: '활성 상태의 브랜치만 병합할 수 있습니다.' },
        { status: 400 },
      );
    }

    const { effective, unresolved } = applyResolutions(
      ctx.plan,
      parsed.data.resolutions,
    );

    // 부분 병합 금지 — 충돌이 하나라도 미해소면 아무것도 적용하지 않는다.
    if (unresolved.length > 0) {
      return NextResponse.json(
        {
          error: `해소되지 않은 충돌이 ${unresolved.length}건 있습니다.`,
          conflicts: unresolved,
        },
        { status: 409 },
      );
    }

    const user = await getCurrentUser().catch(() => null);
    const parentId = await latestMainCommitId(db);

    let mergeCommitId: string | null = null;

    await db.transaction(async (tx) => {
      // 1) main 엔티티 적용 (의존 순서 정렬은 실행기 내부에서).
      await applyNetChangesToMain(tx, effective);

      // 2) 병합 커밋 (main 체인, 적용 델타를 details 로 — Neo4j push 재료).
      const [mergeCommit] = await tx
        .insert(commits)
        .values({
          message: `Merge branch '${ctx.branch.name}': ${mr.title}`,
          isAutoSave: false,
          branchId: null,
          authorId: user?.id ?? null,
          authorEmail: user?.email ?? null,
          parentCommitId: parentId,
        })
        .returning({ id: commits.id });
      mergeCommitId = mergeCommit.id;

      if (effective.length > 0) {
        await tx.insert(commitDetails).values(
          effective.map((c, i) => ({
            commitId: mergeCommit.id,
            operation: c.operation,
            targetTable: c.targetTable,
            targetId: c.targetId,
            beforeSnapshot: c.beforeSnapshot,
            afterSnapshot: c.afterSnapshot,
            seq: i,
          })),
        );
      }

      // 3) 브랜치·MR 상태 전환.
      await tx
        .update(branches)
        .set({
          status: 'merged',
          mergedAt: new Date(),
          mergedBy: user?.id ?? null,
          mergeCommitId: mergeCommit.id,
        })
        .where(eq(branches.id, ctx.branch.id));

      await tx
        .update(mergeRequests)
        .set({
          status: 'merged',
          mergedAt: new Date(),
          mergeCommitId: mergeCommit.id,
        })
        .where(eq(mergeRequests.id, id));
    });

    return NextResponse.json({
      success: true,
      mergeCommitId,
      applied: effective.length,
      identical: ctx.plan.identical.length,
      resolvedConflicts: parsed.data.resolutions.length,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
