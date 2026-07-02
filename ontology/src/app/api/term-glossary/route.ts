import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { termGlossary } from '@/lib/drizzle/schema';
import { handleApiError } from '@/lib/api-error';
import { confirmTermRequestSchema } from '@/features/ontology/lib/terms/types';
import { rowToTermGlossaryEntry } from '@/features/ontology/lib/terms/row';

// PRD-H (H4/M3): 용어집 캐시 목록(GET ?domain=) + 확정 upsert(POST).
// 확정된 뜻은 도메인-스코프로 저장돼 재검색을 막고 이후 추출·검색에 재주입된다.

export async function GET(request: NextRequest) {
  try {
    const domain = request.nextUrl.searchParams.get('domain');
    const db = await getDb();
    const rows = await db.query.termGlossary.findMany({
      where: domain
        ? (g, { eq }) => eq(g.domain, domain)
        : undefined,
      orderBy: (g, { asc }) => [asc(g.createdAt)],
    });
    return NextResponse.json({ entries: rows.map(rowToTermGlossaryEntry) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = confirmTermRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    const db = await getDb();
    // 도메인-스코프 upsert: UNIQUE(domain, term) 충돌 시 뜻/출처/근거를 갱신.
    const [row] = await db
      .insert(termGlossary)
      .values({
        domain: data.domain,
        term: data.term,
        meaning: data.meaning,
        source: data.source,
        confidence: data.confidence ?? null,
        evidence: data.evidence ?? null,
        partitionId: data.partitionId ?? null,
      })
      .onConflictDoUpdate({
        target: [termGlossary.domain, termGlossary.term],
        set: {
          meaning: data.meaning,
          source: data.source,
          confidence: data.confidence ?? null,
          evidence: data.evidence ?? null,
          partitionId: data.partitionId ?? null,
        },
      })
      .returning();

    return NextResponse.json(rowToTermGlossaryEntry(row), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
