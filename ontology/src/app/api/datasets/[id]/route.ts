import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import {
  datasets,
  datasetColumns,
  datasetColumnMappings,
  problemDatasets,
  problems,
} from '@/lib/drizzle/schema';
import { getWorkspaceScope } from '@/lib/authz/getWorkspaceScope';
import { handleApiError } from '@/lib/api-error';

// GET /api/datasets/[id] — 상세(컬럼 프로파일 + 매핑 + 참조 problem = 재사용 가시성).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { workspaceId } = await getWorkspaceScope(request);
    const db = await getDb();

    const [dataset] = await db
      .select()
      .from(datasets)
      .where(and(eq(datasets.id, id), eq(datasets.workspaceId, workspaceId)))
      .limit(1);
    if (!dataset) {
      return NextResponse.json({ error: '데이터셋을 찾을 수 없습니다.' }, { status: 404 });
    }

    const columns = await db
      .select()
      .from(datasetColumns)
      .where(eq(datasetColumns.datasetId, id))
      .orderBy(asc(datasetColumns.ordinalPosition));

    const columnIds = columns.map((c) => c.id);
    const mappings =
      columnIds.length > 0
        ? await db
            .select()
            .from(datasetColumnMappings)
            .where(inArray(datasetColumnMappings.datasetColumnId, columnIds))
        : [];

    // 참조하는 problem 목록(역방향 재사용 가시성).
    const referencedBy = await db
      .select({ problemId: problemDatasets.problemId, title: problems.title, role: problemDatasets.role })
      .from(problemDatasets)
      .leftJoin(problems, eq(problems.id, problemDatasets.problemId))
      .where(eq(problemDatasets.datasetId, id));

    return NextResponse.json({ ...dataset, columns, mappings, referencedBy });
  } catch (err) {
    return handleApiError(err);
  }
}

// DELETE /api/datasets/[id] — 삭제(참조하는 problem 있으면 restrict 로 차단).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { workspaceId } = await getWorkspaceScope(request, 'editor');
    const db = await getDb();
    try {
      const [row] = await db
        .delete(datasets)
        .where(and(eq(datasets.id, id), eq(datasets.workspaceId, workspaceId)))
        .returning();
      if (!row) {
        return NextResponse.json({ error: '데이터셋을 찾을 수 없습니다.' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    } catch (e) {
      if (e instanceof Error && e.message.includes('problem_datasets')) {
        return NextResponse.json(
          { error: '이 데이터셋을 참조하는 문제가 있어 삭제할 수 없습니다.' },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (err) {
    return handleApiError(err);
  }
}
