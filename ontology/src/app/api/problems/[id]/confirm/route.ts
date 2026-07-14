import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { problems } from '@/lib/drizzle/schema';
import { getWorkspaceScope } from '@/lib/authz/getWorkspaceScope';
import { handleApiError } from '@/lib/api-error';
import { confirmStepSchema } from '@/features/problems/schemas';
import {
  confirmStep,
  reopenStep,
  type WorkflowState,
} from '@/features/problems/workflow';

// PATCH /api/problems/[id]/confirm — 단계 확정/재오픈(confirm-gate).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { userId, workspaceId } = await getWorkspaceScope(request, 'editor');
    const body = await request.json();
    const parsed = confirmStepSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = await getDb();
    const [problem] = await db
      .select({ workflowState: problems.workflowState })
      .from(problems)
      .where(and(eq(problems.id, id), eq(problems.workspaceId, workspaceId)))
      .limit(1);
    if (!problem) {
      return NextResponse.json({ error: '문제를 찾을 수 없습니다.' }, { status: 404 });
    }

    const current = (problem.workflowState ?? {}) as WorkflowState;
    const { step, action } = parsed.data;
    const nextState =
      action === 'reopen'
        ? reopenStep(current, step)
        : confirmStep(current, step, userId, new Date().toISOString());

    const [row] = await db
      .update(problems)
      .set({ workflowState: nextState, updatedAt: new Date() })
      .where(and(eq(problems.id, id), eq(problems.workspaceId, workspaceId)))
      .returning();

    return NextResponse.json(row);
  } catch (err) {
    return handleApiError(err);
  }
}
