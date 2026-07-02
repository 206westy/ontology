import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { handleApiError } from '@/lib/api-error';
import { resolveTermsRequestSchema } from '@/features/ontology/lib/terms/types';
import { rowToTermGlossaryEntry } from '@/features/ontology/lib/terms/row';
import { makeGlossaryLookup } from '@/features/ontology/lib/terms/glossary';
import { resolveTerms } from '@/features/ontology/lib/terms/resolve';
import { contextResolve, webResolve } from '@/features/ontology/lib/terms/llm';

// PRD-H (H4/M3): 맥락 주입형 용어 해소 배치 엔드포인트.
// ① 내부 용어집(도메인-스코프) → ② 현재 맥락(primary) → ③ (opt-in) 웹.
// 자동 확정 없음 — 랭킹된 후보만 반환하고 확정은 사용자(POST /api/term-glossary)가 한다.
export async function POST(request: NextRequest) {
  try {
    const parsed = resolveTermsRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    // 도메인-스코프 용어집을 읽어 룩업 함수 구성(재검색 방지 캐시).
    let glossaryLookup = makeGlossaryLookup([]);
    try {
      const db = await getDb();
      const rows = await db.query.termGlossary.findMany({
        where: (g, { eq: whereEq }) => whereEq(g.domain, data.domain),
      });
      glossaryLookup = makeGlossaryLookup(rows.map(rowToTermGlossaryEntry));
    } catch {
      // DB optional in some environments — fall back to LLM/web resolution only.
    }

    const resolutions = await resolveTerms(
      data.terms,
      {
        domain: data.domain,
        domainKo: data.domainKo ?? null,
        adjacentNodes: data.contextNodes,
        candidateType: data.candidateType ?? null,
        allowWeb: data.allowWeb,
      },
      { glossaryLookup, contextResolveFn: contextResolve, webResolveFn: webResolve },
    );

    return NextResponse.json({ resolutions });
  } catch (err) {
    return handleApiError(err);
  }
}
