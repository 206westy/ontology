import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import {
  problems,
  problemOntologyLinks,
  ontologies,
  partitions,
  branches,
  commits,
} from '@/lib/drizzle/schema';
import { getWorkspaceScope } from '@/lib/authz/getWorkspaceScope';
import { handleApiError, ForbiddenError } from '@/lib/api-error';
import { createLinkSchema } from '@/features/problems/schemas';
import {
  unlockAfterLink,
  type WorkflowState,
} from '@/features/problems/workflow';
import { buildMainSnapshot } from '@/lib/branches/snapshot';

function toSlug(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'onto'}-${crypto.randomUUID().slice(0, 6)}`;
}

// GET /api/problems/[id]/links — 문제의 온톨로지 링크(재사용 계보).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { workspaceId } = await getWorkspaceScope(request);
    const db = await getDb();

    const [problem] = await db
      .select({ id: problems.id })
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

    return NextResponse.json(links);
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/problems/[id]/links — 온톨로지 연결(새로/재사용/확장/분기). data·studio 잠금 해제.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { userId, workspaceId } = await getWorkspaceScope(request, 'editor');
    const body = await request.json();
    const parsed = createLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { mode, isPrimary = true } = parsed.data;

    const db = await getDb();
    const [problem] = await db
      .select({ id: problems.id, title: problems.title, workflowState: problems.workflowState })
      .from(problems)
      .where(and(eq(problems.id, id), eq(problems.workspaceId, workspaceId)))
      .limit(1);
    if (!problem) {
      return NextResponse.json({ error: '문제를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 대상 온톨로지 결정(mode 별). reuse/extend/branch 는 워크스페이스 소속 검증.
    async function resolveTargetOntology(): Promise<{ ontologyId: string; branchId: string | null }> {
      if (mode === 'new') {
        const name = parsed.data.newOntologyName?.trim() || `${problem.title} 온톨로지`;
        const [onto] = await db
          .insert(ontologies)
          .values({ workspaceId, name, slug: toSlug(name), createdBy: userId })
          .returning();
        await db.insert(partitions).values({ ontologyId: onto.id, name: '기본 구획' });
        return { ontologyId: onto.id, branchId: null };
      }

      const ontologyId = parsed.data.ontologyId;
      if (!ontologyId) {
        throw new ForbiddenError('재사용/확장/분기 모드는 대상 온톨로지가 필요합니다.');
      }
      const [onto] = await db
        .select({ id: ontologies.id })
        .from(ontologies)
        .where(and(eq(ontologies.id, ontologyId), eq(ontologies.workspaceId, workspaceId)))
        .limit(1);
      if (!onto) {
        throw new ForbiddenError('이 워크스페이스의 온톨로지가 아닙니다.');
      }

      if (mode === 'branch') {
        const latestMain = await db.query.commits.findFirst({
          columns: { id: true },
          where: and(eq(commits.ontologyId, ontologyId), isNull(commits.branchId)),
          orderBy: [desc(commits.createdAt)],
        });
        const snapshot = await buildMainSnapshot(db, ontologyId);
        const branchName = `${problem.title.slice(0, 40)}-${crypto.randomUUID().slice(0, 6)}`;
        const [branch] = await db
          .insert(branches)
          .values({
            ontologyId,
            name: branchName,
            description: `문제 "${problem.title}" 전용 분기`,
            authorId: userId,
            baseCommitId: latestMain?.id ?? null,
            baseSnapshot: snapshot,
          })
          .returning({ id: branches.id });
        return { ontologyId, branchId: branch.id };
      }

      return { ontologyId, branchId: null };
    }

    const { ontologyId, branchId } = await resolveTargetOntology();

    // 주 온톨로지 지정 시 기존 primary 해제(문제당 primary 1개).
    if (isPrimary) {
      await db
        .update(problemOntologyLinks)
        .set({ isPrimary: false })
        .where(eq(problemOntologyLinks.problemId, id));
    }

    const [link] = await db
      .insert(problemOntologyLinks)
      .values({ problemId: id, ontologyId, linkMode: mode, branchId, isPrimary })
      .returning();

    // 온톨로지 연결 확정 → data·studio 잠금 해제(R1: 자유 왕복).
    const nextState = unlockAfterLink((problem.workflowState ?? {}) as WorkflowState);
    await db
      .update(problems)
      .set({ workflowState: nextState, status: 'in_progress', updatedAt: new Date() })
      .where(eq(problems.id, id));

    return NextResponse.json(link, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
