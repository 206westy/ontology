import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { datasets, datasetColumns } from '@/lib/drizzle/schema';
import { getWorkspaceScope } from '@/lib/authz/getWorkspaceScope';
import { handleApiError } from '@/lib/api-error';
import { z } from 'zod';
import { profileCsv } from '@/lib/datasets/profile';

const reqSchema = z.object({ csvText: z.string().min(1).max(15_000_000) });

// PRD-PF-D M4/수용기준: 원본 재업로드 시 스키마 드리프트 감지. 체크섬 불일치 → status='stale'.
// 비파괴·HITL: 컬럼·매핑을 자동 재작성하지 않는다(사용자가 재확인). 컬럼 diff 를 배너용으로 반환.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { workspaceId } = await getWorkspaceScope(request, 'editor');
    const body = await request.json();
    const parsed = reqSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = await getDb();
    const [ds] = await db
      .select({ id: datasets.id, checksum: datasets.checksum })
      .from(datasets)
      .where(and(eq(datasets.id, id), eq(datasets.workspaceId, workspaceId)))
      .limit(1);
    if (!ds) {
      return NextResponse.json({ error: '데이터셋을 찾을 수 없습니다.' }, { status: 404 });
    }

    const profile = profileCsv(parsed.data.csvText);
    const drifted = profile.checksum !== ds.checksum;

    // 컬럼 diff(배너 정보용, 비파괴).
    const existing = await db
      .select({ name: datasetColumns.name })
      .from(datasetColumns)
      .where(eq(datasetColumns.datasetId, id));
    const oldNames = new Set(existing.map((c) => c.name));
    const newNames = new Set(profile.columns.map((c) => c.name));
    const addedColumns = [...newNames].filter((n) => !oldNames.has(n));
    const removedColumns = [...oldNames].filter((n) => !newNames.has(n));

    await db
      .update(datasets)
      .set({
        status: drifted ? 'stale' : 'ready',
        checksum: profile.checksum,
        rowCount: profile.rowCount,
        refreshedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(datasets.id, id), eq(datasets.workspaceId, workspaceId)));

    return NextResponse.json({
      drifted,
      addedColumns,
      removedColumns,
      rowCount: profile.rowCount,
      status: drifted ? 'stale' : 'ready',
    });
  } catch (err) {
    return handleApiError(err);
  }
}
