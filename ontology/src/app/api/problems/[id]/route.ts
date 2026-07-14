import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { problems, problemOntologyLinks, ontologies } from '@/lib/drizzle/schema';
import { getWorkspaceScope } from '@/lib/authz/getWorkspaceScope';
import { handleApiError } from '@/lib/api-error';
import { updateProblemSchema } from '@/features/problems/schemas';

// GET /api/problems/[id] — 문제 상세 + 온톨로지 링크(재사용 계보).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { workspaceId } = await getWorkspaceScope(request);
    const db = await getDb();

    const [problem] = await db
      .select()
      .from(problems)
      .where(and(eq(problems.id, id), eq(problems.workspaceId, workspaceId)))
      .limit(1);
    if (!problem) {
      return NextResponse.json({ error: '문제를 찾을 수 없습니다.' }, { status: 404 });
    }

    const links = await db
      .select({
        id: problemOntologyLinks.id,
        ontologyId: problemOntologyLinks.ontologyId,
        ontologyName: ontologies.name,
        linkMode: problemOntologyLinks.linkMode,
        branchId: problemOntologyLinks.branchId,
        isPrimary: problemOntologyLinks.isPrimary,
      })
      .from(problemOntologyLinks)
      .leftJoin(ontologies, eq(ontologies.id, problemOntologyLinks.ontologyId))
      .where(eq(problemOntologyLinks.problemId, id));

    return NextResponse.json({ ...problem, links });
  } catch (err) {
    return handleApiError(err);
  }
}

// PATCH /api/problems/[id] — 문제 정의 재편집.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { workspaceId } = await getWorkspaceScope(request, 'editor');
    const body = await request.json();
    const parsed = updateProblemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = await getDb();
    const [row] = await db
      .update(problems)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(problems.id, id), eq(problems.workspaceId, workspaceId)))
      .returning();

    if (!row) {
      return NextResponse.json({ error: '문제를 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (err) {
    return handleApiError(err);
  }
}

// DELETE /api/problems/[id] — 문제 삭제(링크는 cascade).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { workspaceId } = await getWorkspaceScope(request, 'editor');
    const db = await getDb();
    const [row] = await db
      .delete(problems)
      .where(and(eq(problems.id, id), eq(problems.workspaceId, workspaceId)))
      .returning();
    if (!row) {
      return NextResponse.json({ error: '문제를 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
