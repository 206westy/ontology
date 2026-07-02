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

// PRD-H (H1/M1): 패턴 캐시 목록/히트(GET) + 승격(POST).

export async function GET(request: NextRequest) {
  try {
    const domain = request.nextUrl.searchParams.get('domain');
    const db = await getDb();
    const rows = (
      await db.query.patterns.findMany({
        orderBy: (p, { asc }) => [asc(p.createdAt)],
      })
    ).map(rowToPattern);

    // domain 지정 시 히트(최신 비-draft) 하나, 아니면 전체 목록.
    if (domain) {
      return NextResponse.json({ pattern: selectCachedPattern(domain, rows) });
    }
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
