import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { dashboards, dashboardWidgets } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';

// GET — 대시보드 + 위젯 목록.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ontologyId } = await getOntologyScope(request);
    const db = await getDb();
    const dash = await db.query.dashboards.findFirst({
      where: and(eq(dashboards.id, id), eq(dashboards.ontologyId, ontologyId)),
    });
    if (!dash) {
      return NextResponse.json({ error: '대시보드를 찾을 수 없습니다.' }, { status: 404 });
    }
    const widgets = await db.query.dashboardWidgets.findMany({
      where: eq(dashboardWidgets.dashboardId, id),
      orderBy: (w, { asc }) => [asc(w.createdAt)],
    });
    return NextResponse.json({ ...dash, widgets });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ontologyId } = await getOntologyScope(request, 'editor');
    const db = await getDb();
    const [row] = await db
      .delete(dashboards)
      .where(and(eq(dashboards.id, id), eq(dashboards.ontologyId, ontologyId)))
      .returning();
    if (!row) {
      return NextResponse.json({ error: '대시보드를 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
