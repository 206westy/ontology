import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { patterns } from '@/lib/drizzle/schema';
import { handleApiError } from '@/lib/api-error';
import { promotePatternRequestSchema } from '@/features/ontology/lib/patterns/types';
import { rowToPattern } from '@/features/ontology/lib/patterns/row';
import {
  selectCachedPattern,
  nextPatternVersion,
} from '@/features/ontology/lib/patterns/cache';
import {
  filterAndSortPatterns,
  isCatalogQuery,
} from '@/features/ontology/lib/patterns/catalog';

// PRD-H (H1/M1): 패턴 캐시 목록/히트(GET) + 승격(POST).
// PRD-BM-D01 (M1-2): 카탈로그 필터·정렬 확장. 단독 ?domain= 은 히트(하위호환).

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const query = {
      domain: sp.get('domain'),
      visibility: sp.get('visibility'),
      source: sp.get('source'),
      q: sp.get('q'),
      sort: sp.get('sort'),
      mode: sp.get('mode'),
    };
    const db = await getDb();
    const rows = (
      await db.query.patterns.findMany({
        orderBy: (p, { asc }) => [asc(p.createdAt)],
      })
    ).map(rowToPattern);

    // 카탈로그 모드(필터/정렬 파라미터 존재) → 좁힌 목록.
    if (isCatalogQuery(query)) {
      return NextResponse.json(filterAndSortPatterns(rows, query));
    }
    // 하위호환: 단독 ?domain= 은 도메인 히트(수렴) 하나.
    if (query.domain) {
      return NextResponse.json({ pattern: selectCachedPattern(query.domain, rows) });
    }
    // 기본: 전체 목록.
    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = promotePatternRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    const db = await getDb();
    const existing = (
      await db.query.patterns.findMany({
        where: (p, { eq }) => eq(p.key, data.key),
      })
    ).map(rowToPattern);
    const version = nextPatternVersion(data.key, existing);
    const previous = selectCachedPattern(data.domain, existing);

    const [row] = await db
      .insert(patterns)
      .values({
        key: data.key,
        name: data.name,
        nameKo: data.nameKo,
        version,
        domain: data.domain,
        roles: data.roles,
        relationTypes: data.relationTypes,
        competencyQuestions: data.competencyQuestions,
        traversalTemplates: data.traversalTemplates,
        method: data.method,
        sourceRepo: data.sourceRepo ?? null,
        sourceUri: data.sourceUri ?? null,
        sourceLabel: data.sourceLabel ?? null,
        license: data.license ?? null,
        isDraft: false,
        previousVersionId: previous?.id ?? null,
      })
      .returning();

    return NextResponse.json(rowToPattern(row), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
