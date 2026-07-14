import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { problems, datasets, problemDatasets } from '@/lib/drizzle/schema';
import { getWorkspaceScope } from '@/lib/authz/getWorkspaceScope';
import { handleApiError } from '@/lib/api-error';
import { attachDatasetSchema } from '@/features/datasets/schemas';

// GET /api/problems/[id]/datasets — 문제에 연결된 데이터셋(재사용).
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

    const rows = await db
      .select({
        id: problemDatasets.id,
        datasetId: problemDatasets.datasetId,
        datasetName: datasets.name,
        rowCount: datasets.rowCount,
        status: datasets.status,
        role: problemDatasets.role,
        attachedAt: problemDatasets.attachedAt,
      })
      .from(problemDatasets)
      .leftJoin(datasets, eq(datasets.id, problemDatasets.datasetId))
      .where(eq(problemDatasets.problemId, id));

    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/problems/[id]/datasets — 기존 데이터셋 재연결(재파싱 불필요).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { userId, workspaceId } = await getWorkspaceScope(request, 'editor');
    const body = await request.json();
    const parsed = attachDatasetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = await getDb();

    // 문제·데이터셋 모두 워크스페이스 소속 검증.
    const [problem] = await db
      .select({ id: problems.id })
      .from(problems)
      .where(and(eq(problems.id, id), eq(problems.workspaceId, workspaceId)))
      .limit(1);
    if (!problem) {
      return NextResponse.json({ error: '문제를 찾을 수 없습니다.' }, { status: 404 });
    }
    const [ds] = await db
      .select({ id: datasets.id })
      .from(datasets)
      .where(and(eq(datasets.id, parsed.data.datasetId), eq(datasets.workspaceId, workspaceId)))
      .limit(1);
    if (!ds) {
      return NextResponse.json({ error: '데이터셋을 찾을 수 없습니다.' }, { status: 404 });
    }

    try {
      const [row] = await db
        .insert(problemDatasets)
        .values({
          problemId: id,
          datasetId: parsed.data.datasetId,
          role: parsed.data.role,
          attachedBy: userId,
        })
        .returning();
      return NextResponse.json(row, { status: 201 });
    } catch (e) {
      if (e instanceof Error && e.message.includes('uq_problem_dataset')) {
        return NextResponse.json({ error: '이미 연결된 데이터셋입니다.' }, { status: 409 });
      }
      throw e;
    }
  } catch (err) {
    return handleApiError(err);
  }
}
