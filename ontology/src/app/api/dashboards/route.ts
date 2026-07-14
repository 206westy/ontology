import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { dashboards } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';

// PRD-PF-G M2: 대시보드 목록/생성. 온톨로지 스코프 + 선택적 problem_id(문제 보드뷰).
export async function GET(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request);
    const { searchParams } = new URL(request.url);
    const problemId = searchParams.get('problemId');
    const db = await getDb();
    const rows = await db.query.dashboards.findMany({
      where: problemId
        ? and(eq(dashboards.ontologyId, ontologyId), eq(dashboards.problemId, problemId))
        : eq(dashboards.ontologyId, ontologyId),
      orderBy: (d, { desc }) => [desc(d.createdAt)],
    });
    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  problemId: z.string().uuid().nullable().optional(),
  isDefault: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { ontologyId, userId } = await getOntologyScope(request, 'editor');
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const db = await getDb();
    const [row] = await db
      .insert(dashboards)
      .values({
        ontologyId,
        name: parsed.data.name,
        description: parsed.data.description ?? '',
        problemId: parsed.data.problemId ?? null,
        isDefault: parsed.data.isDefault ?? false,
        createdBy: userId,
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
