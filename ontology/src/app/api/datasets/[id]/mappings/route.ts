import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import {
  datasets,
  datasetColumns,
  datasetColumnMappings,
  classes,
  properties,
  attributions,
} from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';
import { createMappingSchema } from '@/features/datasets/schemas';

// GET /api/datasets/[id]/mappings — 이 데이터셋 × 활성 온톨로지의 컬럼 매핑.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ontologyId, workspaceId } = await getOntologyScope(request);
    const db = await getDb();

    const [ds] = await db
      .select({ id: datasets.id })
      .from(datasets)
      .where(and(eq(datasets.id, id), eq(datasets.workspaceId, workspaceId)))
      .limit(1);
    if (!ds) {
      return NextResponse.json({ error: '데이터셋을 찾을 수 없습니다.' }, { status: 404 });
    }

    const cols = await db
      .select({ id: datasetColumns.id })
      .from(datasetColumns)
      .where(eq(datasetColumns.datasetId, id));
    const columnIds = cols.map((c) => c.id);
    if (columnIds.length === 0) return NextResponse.json([]);

    const rows = await db
      .select()
      .from(datasetColumnMappings)
      .where(
        and(
          inArray(datasetColumnMappings.datasetColumnId, columnIds),
          eq(datasetColumnMappings.ontologyId, ontologyId),
        ),
      );
    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/datasets/[id]/mappings — 컬럼→클래스/속성 매핑(HITL 확인 필수, 자동확정 금지).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ontologyId, userId, workspaceId } = await getOntologyScope(request, 'editor');
    const body = await request.json();
    const parsed = createMappingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    const db = await getDb();

    // 컬럼이 이 데이터셋(=워크스페이스) 소속인지 검증.
    const [col] = await db
      .select({ id: datasetColumns.id, name: datasetColumns.name })
      .from(datasetColumns)
      .innerJoin(datasets, eq(datasets.id, datasetColumns.datasetId))
      .where(
        and(
          eq(datasetColumns.id, d.datasetColumnId),
          eq(datasetColumns.datasetId, id),
          eq(datasets.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!col) {
      return NextResponse.json({ error: '컬럼을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 대상 클래스/속성이 활성 온톨로지 소속인지 검증(교차 온톨로지 매핑 차단).
    if (d.targetType === 'class' && d.targetClassId) {
      const [c] = await db
        .select({ id: classes.id })
        .from(classes)
        .where(and(eq(classes.id, d.targetClassId), eq(classes.ontologyId, ontologyId)))
        .limit(1);
      if (!c) return NextResponse.json({ error: '대상 클래스가 이 온톨로지에 없습니다.' }, { status: 400 });
    }
    if (d.targetType === 'property' && d.targetPropertyId) {
      const [p] = await db
        .select({ id: properties.id })
        .from(properties)
        .where(and(eq(properties.id, d.targetPropertyId), eq(properties.ontologyId, ontologyId)))
        .limit(1);
      if (!p) return NextResponse.json({ error: '대상 속성이 이 온톨로지에 없습니다.' }, { status: 400 });
    }

    const [row] = await db
      .insert(datasetColumnMappings)
      .values({
        datasetColumnId: d.datasetColumnId,
        ontologyId,
        targetType: d.targetType,
        targetClassId: d.targetType === 'class' ? d.targetClassId : null,
        targetPropertyId: d.targetType === 'property' ? d.targetPropertyId : null,
        confidence: d.confidence,
        source: d.source,
        createdBy: userId,
      })
      .returning();

    // PRD-PF-D M4: provenance — "이 클래스/속성은 어느 데이터셋 컬럼에서 왔나"를 attributions 에 기록.
    // sourceRef=dataset:<id>#<컬럼명>. ontologyId 는 활성 온톨로지로 정확히 스코프.
    await db.insert(attributions).values({
      ontologyId,
      targetTable: d.targetType === 'class' ? 'classes' : 'properties',
      targetId: (d.targetType === 'class' ? d.targetClassId : d.targetPropertyId) as string,
      sourceType: 'document',
      sourceRef: `dataset:${id}#${col.name}`,
      evidence: `데이터셋 컬럼 "${col.name}" 매핑`,
      confidence: d.confidence ?? null,
    });

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
