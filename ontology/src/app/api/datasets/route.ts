import { NextRequest, NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { datasets, datasources, datasetColumns } from '@/lib/drizzle/schema';
import { getWorkspaceScope } from '@/lib/authz/getWorkspaceScope';
import { handleApiError } from '@/lib/api-error';
import { registerCsvSchema } from '@/features/datasets/schemas';
import { profileCsv } from '@/lib/datasets/profile';

// GET /api/datasets — 워크스페이스 데이터셋 목록(컬럼 수 포함).
export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await getWorkspaceScope(request);
    const db = await getDb();
    const rows = await db
      .select({
        id: datasets.id,
        name: datasets.name,
        description: datasets.description,
        status: datasets.status,
        rowCount: datasets.rowCount,
        checksum: datasets.checksum,
        createdAt: datasets.createdAt,
        updatedAt: datasets.updatedAt,
        columnCount: sql<number>`count(${datasetColumns.id})::int`,
      })
      .from(datasets)
      .leftJoin(datasetColumns, eq(datasetColumns.datasetId, datasets.id))
      .where(eq(datasets.workspaceId, workspaceId))
      .groupBy(datasets.id)
      .orderBy(desc(datasets.updatedAt));

    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/datasets — CSV 텍스트를 등록물로 승격(datasource+dataset+columns). 재파싱 제거의 핵심.
export async function POST(request: NextRequest) {
  try {
    const { userId, workspaceId } = await getWorkspaceScope(request, 'editor');
    const body = await request.json();
    const parsed = registerCsvSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const profile = profileCsv(parsed.data.csvText);
    if (profile.columns.length === 0) {
      return NextResponse.json({ error: 'CSV 에서 컬럼을 찾지 못했습니다.' }, { status: 400 });
    }

    const db = await getDb();

    // 소스 자동 생성(사용자가 별도 "연결"을 만들 필요 없음 — 기존 UX 회귀 없음).
    const [ds] = await db
      .insert(datasources)
      .values({ workspaceId, type: 'csv', name: parsed.data.name, createdBy: userId })
      .returning({ id: datasources.id });

    const nowIso = new Date();
    let dataset;
    try {
      [dataset] = await db
        .insert(datasets)
        .values({
          workspaceId,
          datasourceId: ds.id,
          name: parsed.data.name,
          description: parsed.data.description ?? '',
          status: 'ready',
          rowCount: profile.rowCount,
          checksum: profile.checksum,
          refreshedAt: nowIso,
          createdBy: userId,
        })
        .returning();
    } catch (e) {
      if (e instanceof Error && e.message.includes('uq_dataset_name_per_ws')) {
        return NextResponse.json({ error: '같은 이름의 데이터셋이 이미 있습니다.' }, { status: 409 });
      }
      throw e;
    }

    await db.insert(datasetColumns).values(
      profile.columns.map((c) => ({
        datasetId: dataset.id,
        name: c.name,
        ordinalPosition: c.ordinalPosition,
        dataType: c.dataType,
        nullable: c.nullable,
        missingRate: c.missingRate,
        distinctCount: c.distinctCount,
        sampleValues: c.sampleValues,
        minValue: c.minValue,
        maxValue: c.maxValue,
        enumValues: c.enumValues,
        profiledAt: nowIso,
      })),
    );

    return NextResponse.json(
      { ...dataset, columnCount: profile.columns.length, sampledRows: profile.sampledRows },
      { status: 201 },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
