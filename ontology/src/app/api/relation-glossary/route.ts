import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { handleApiError } from '@/lib/api-error';

// PRD-L M6 (L7): 성장형 관계 어휘집 조회 — 전략 생성기·후속 UI용.
// occurrence_count 내림차순(자주 등장한 대표어 우선). layer 쿼리파라미터로 선택 필터.
export async function GET(request: NextRequest) {
  try {
    const layer = new URL(request.url).searchParams.get('layer');
    const db = await getDb();

    const rows = await db.query.relationGlossary.findMany({
      where:
        layer === 'semantic' || layer === 'kinetic'
          ? (g, { eq }) => eq(g.layer, layer)
          : undefined,
      orderBy: (g, { desc }) => [desc(g.occurrenceCount)],
    });

    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}
