import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { actionItems } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';

// PRD-PF-G M3: 액션보드 처리 큐. 기본 = 미처리 이상만(status=pending, verdict∈{fail,warn}).
export async function GET(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request);
    const { searchParams } = new URL(request.url);
    const all = searchParams.get('all') === '1';
    const problemId = searchParams.get('problemId');

    const clauses = [eq(actionItems.ontologyId, ontologyId)];
    if (!all) {
      clauses.push(eq(actionItems.status, 'pending'));
      clauses.push(inArray(actionItems.verdict, ['fail', 'warn']));
    }
    if (problemId) clauses.push(eq(actionItems.problemId, problemId));

    const db = await getDb();
    const rows = await db.query.actionItems.findMany({
      where: and(...clauses),
      orderBy: (a, { desc }) => [desc(a.score), desc(a.createdAt)],
      limit: 500,
    });
    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

const createSchema = z.object({
  verdict: z.enum(['fail', 'warn', 'pass']),
  sourceFunctionId: z.string().uuid().nullable().optional(),
  subjectInstanceId: z.string().uuid().nullable().optional(),
  problemId: z.string().uuid().nullable().optional(),
  score: z.number().nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).optional(),
});

// POST — 제안 생성(에이전트/수동). 항상 pending(미확정) 으로만 생성. 확정은 별도 전이 API.
export async function POST(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request, 'editor');
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const db = await getDb();
    const [row] = await db
      .insert(actionItems)
      .values({
        ontologyId,
        verdict: parsed.data.verdict,
        sourceFunctionId: parsed.data.sourceFunctionId ?? null,
        subjectInstanceId: parsed.data.subjectInstanceId ?? null,
        problemId: parsed.data.problemId ?? null,
        score: parsed.data.score ?? null,
        evidence: parsed.data.evidence ?? {},
        status: 'pending',
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
