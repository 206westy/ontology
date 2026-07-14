import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { automationRuns } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';

// PRD-PF-I M2/M4: 자동화 실행 이력(append-only 감사). 실패/스킵도 기록 → "왜 안 돌았는지" 추적.
export async function GET(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request);
    const { searchParams } = new URL(request.url);
    const triggerId = searchParams.get('triggerId');
    const db = await getDb();
    const rows = await db.query.automationRuns.findMany({
      where: triggerId
        ? and(eq(automationRuns.ontologyId, ontologyId), eq(automationRuns.triggerId, triggerId))
        : eq(automationRuns.ontologyId, ontologyId),
      orderBy: (r, { desc }) => [desc(r.createdAt)],
      limit: 200,
    });
    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}
