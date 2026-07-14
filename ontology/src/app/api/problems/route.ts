import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { problems, problemOntologyLinks, ontologies } from '@/lib/drizzle/schema';
import { getWorkspaceScope } from '@/lib/authz/getWorkspaceScope';
import { handleApiError } from '@/lib/api-error';
import { createProblemSchema } from '@/features/problems/schemas';

// GET /api/problems — 워크스페이스 내 문제 목록(주 온톨로지명 조인, 최근 활동순).
export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await getWorkspaceScope(request);
    const db = await getDb();
    const rows = await db
      .select({
        id: problems.id,
        title: problems.title,
        description: problems.description,
        status: problems.status,
        workflowState: problems.workflowState,
        goalMetric: problems.goalMetric,
        updatedAt: problems.updatedAt,
        createdAt: problems.createdAt,
        primaryOntologyId: ontologies.id,
        primaryOntologyName: ontologies.name,
      })
      .from(problems)
      .leftJoin(
        problemOntologyLinks,
        and(
          eq(problemOntologyLinks.problemId, problems.id),
          eq(problemOntologyLinks.isPrimary, true),
        ),
      )
      .leftJoin(ontologies, eq(ontologies.id, problemOntologyLinks.ontologyId))
      .where(eq(problems.workspaceId, workspaceId))
      .orderBy(desc(problems.updatedAt));

    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/problems — 새 문제 정의(define 확정). 이후 온톨로지 연결(links)에서 data/studio 잠금 해제.
export async function POST(request: NextRequest) {
  try {
    const { userId, workspaceId } = await getWorkspaceScope(request, 'editor');
    const body = await request.json();
    const parsed = createProblemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const db = await getDb();
    const [row] = await db
      .insert(problems)
      .values({
        workspaceId,
        title: parsed.data.title,
        description: parsed.data.description ?? '',
        goalMetric: parsed.data.goalMetric ?? {},
        actionSlots: parsed.data.actionSlots ?? [],
        decisionQuestions: parsed.data.decisionQuestions ?? [],
        status: 'defining',
        // define = 확정(폼 제출 = 확정), 나머지는 온톨로지 연결 전까지 잠금.
        workflowState: {
          define: { state: 'confirmed', confirmedBy: userId, confirmedAt: nowIso },
          data: { state: 'locked' },
          studio: { state: 'locked' },
          functions: { state: 'locked' },
          board: { state: 'locked' },
        },
        createdBy: userId,
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
