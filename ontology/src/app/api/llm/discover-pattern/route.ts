import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { handleApiError } from '@/lib/api-error';
import { discoverPatternRequestSchema } from '@/features/ontology/lib/patterns/types';
import { rowToPattern } from '@/features/ontology/lib/patterns/row';
import { selectCachedPattern } from '@/features/ontology/lib/patterns/cache';
import { discover } from '@/features/ontology/lib/patterns/discover';
import { lovSource } from '@/features/ontology/lib/patterns/discovery/lov';
import {
  recognizeDomain,
  adaptPattern,
  synthesizePattern,
} from '@/features/ontology/lib/patterns/llm';

// PRD-H (H2/M1): 도메인 인지 → 캐시 히트면 재사용(수렴), 미스면 발견(retrieve›adapt›synthesize).
// 컨펌 게이트: 이 라우트는 그래프를 생성하지 않는다 — 요약/패턴 초안만 돌려준다.
export async function POST(request: NextRequest) {
  try {
    const parsed = discoverPatternRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { text } = parsed.data;

    // 1) 도메인 인지(mini).
    const recognize = await recognizeDomain(text);

    // 2) 캐시 히트 검사(수렴).
    const db = await getDb();
    const rows = await db.query.patterns.findMany({
      where: (p, { eq }) => eq(p.domain, recognize.domain),
    });
    const cached = selectCachedPattern(recognize.domain, rows.map(rowToPattern));
    if (cached) {
      return NextResponse.json({ cached: true, recognize, pattern: cached });
    }

    // 3) 미스 → 발견(실제 LOV 소스 + primary adapt/synthesize).
    const result = await discover(
      {
        domain: recognize.domain,
        domainKo: recognize.domainKo,
        text,
        competencyQuestions: recognize.competencyQuestionPreview,
      },
      { sources: [lovSource], adaptFn: adaptPattern, synthesizeFn: synthesizePattern },
    );

    // 승격(POST /api/patterns)에 바로 넣을 수 있는 초안 형태로 반환.
    const draft = {
      key: recognize.recommendedPatternKey ?? recognize.domain,
      domain: recognize.domain,
      ...result.bundle,
      method: result.method,
      sourceRepo: result.source?.repo ?? null,
      sourceUri: result.source?.uri ?? null,
      sourceLabel: result.source?.label ?? null,
      license: result.source?.license ?? null,
    };

    return NextResponse.json({
      cached: false,
      recognize,
      method: result.method,
      source: result.source,
      draft,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
