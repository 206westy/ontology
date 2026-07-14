import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { dashboards, dashboardWidgets } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';

// DELETE — 위젯 제거(뷰 빌더). 소유 대시보드가 현재 온톨로지 스코프인지 확인 후 삭제.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ontologyId } = await getOntologyScope(request, 'editor');
    const db = await getDb();
    const ownDashboards = await db.query.dashboards.findMany({
      where: eq(dashboards.ontologyId, ontologyId),
      columns: { id: true },
    });
    const ids = ownDashboards.map((d) => d.id);
    if (ids.length === 0) {
      return NextResponse.json({ error: '위젯을 찾을 수 없습니다.' }, { status: 404 });
    }
    const [row] = await db
      .delete(dashboardWidgets)
      .where(and(eq(dashboardWidgets.id, id), inArray(dashboardWidgets.dashboardId, ids)))
      .returning();
    if (!row) {
      return NextResponse.json({ error: '위젯을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
