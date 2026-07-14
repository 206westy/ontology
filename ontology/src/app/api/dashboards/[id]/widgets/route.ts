import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { dashboards, dashboardWidgets } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';

// PRD-PF-G M4: 뷰 빌더 — 위젯 추가(노코드). config 는 라이브러리 중립 스키마.
const createSchema = z.object({
  widgetType: z.enum(['control_chart', 'trend', 'histogram', 'kpi_card', 'anomaly_list']),
  title: z.string().max(120).optional(),
  sourceKind: z.enum(['decision_function', 'spc_series', 'instance_property']),
  sourceRef: z.record(z.string(), z.unknown()).default({}),
  config: z.record(z.string(), z.unknown()).optional(),
  position: z.record(z.string(), z.unknown()).optional(),
  refreshIntervalS: z.number().int().min(0).max(3600).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ontologyId } = await getOntologyScope(request, 'editor');
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const db = await getDb();
    const dash = await db.query.dashboards.findFirst({
      where: and(eq(dashboards.id, id), eq(dashboards.ontologyId, ontologyId)),
    });
    if (!dash) {
      return NextResponse.json({ error: '대시보드를 찾을 수 없습니다.' }, { status: 404 });
    }
    const [row] = await db
      .insert(dashboardWidgets)
      .values({
        dashboardId: id,
        widgetType: parsed.data.widgetType,
        title: parsed.data.title ?? '',
        sourceKind: parsed.data.sourceKind,
        sourceRef: parsed.data.sourceRef,
        config: parsed.data.config ?? {},
        position: parsed.data.position ?? {},
        refreshIntervalS: parsed.data.refreshIntervalS ?? 30,
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
