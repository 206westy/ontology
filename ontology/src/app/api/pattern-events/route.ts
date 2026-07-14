import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { patternEvents, patterns } from '@/lib/drizzle/schema';
import { handleApiError } from '@/lib/api-error';
import { patternEventRequestSchema } from '@/features/ontology/lib/patterns/types';

// PRD-BM-D01 (M0-3): 패턴 마켓플레이스 계측.
// POST: 이벤트 삽입(+ pattern_seeded 면 사용빈도 occurrence_count +1).
// GET ?summary=ttfg: 세션별 TTFG(첫 그래프까지 시간)를 "패턴 시작 vs 자유입력" 코호트로 집계.

export async function POST(request: NextRequest) {
  try {
    const parsed = patternEventRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const db = await getDb();

    const [row] = await db
      .insert(patternEvents)
      .values({
        sessionId: d.sessionId,
        eventType: d.eventType,
        patternId: d.patternId ?? null,
        patternSource: d.patternSource ?? null,
        partitionId: d.partitionId ?? null,
        props: d.props ?? {},
      })
      .returning();

    // 시딩 이벤트 → 사용빈도 +1 (신뢰 신호·큐레이션·정렬). 단, 같은 세션·패턴은 1회만 반영해
    // API 직접 반복 호출로 카탈로그 순위를 부풀리는 게이밍을 차단한다.
    if (d.eventType === 'pattern_seeded' && d.patternId) {
      const seeds = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(patternEvents)
        .where(
          and(
            eq(patternEvents.sessionId, d.sessionId),
            eq(patternEvents.patternId, d.patternId),
            eq(patternEvents.eventType, 'pattern_seeded'),
          ),
        );
      // 방금 삽입한 1건만 있으면(이 세션에서 이 패턴 첫 시딩) 증가.
      if ((seeds[0]?.n ?? 0) <= 1) {
        await db
          .update(patterns)
          .set({ occurrenceCount: sql`${patterns.occurrenceCount} + 1` })
          .where(eq(patterns.id, d.patternId));
      }
    }

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

// TTFG 코호트 집계: session_started→first_commit 경과(초)를, 세션에 pattern_seeded 가
// 있었는지(그리고 출처)로 나눠 중앙값·평균·표본수를 낸다. 활성화 델타를 숫자로 비교하는 근거.
const TTFG_SUMMARY_SQL = sql`
  WITH sess AS (
    SELECT
      session_id,
      MIN(created_at) FILTER (WHERE event_type = 'session_started') AS started,
      MIN(created_at) FILTER (WHERE event_type = 'first_commit')    AS committed,
      BOOL_OR(event_type = 'pattern_seeded')                        AS seeded,
      (ARRAY_AGG(pattern_source) FILTER (WHERE event_type = 'pattern_seeded'))[1] AS source
    FROM pattern_events
    WHERE created_at > now() - interval '180 days'
    GROUP BY session_id
  ),
  ttfg AS (
    SELECT
      CASE WHEN seeded THEN 'pattern' ELSE 'free' END AS cohort,
      source,
      EXTRACT(EPOCH FROM (committed - started)) AS ttfg_sec
    FROM sess
    WHERE started IS NOT NULL AND committed IS NOT NULL
  )
  SELECT
    cohort,
    source,
    COUNT(*)::int AS sessions,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ttfg_sec)::numeric, 1) AS median_ttfg_sec,
    ROUND(AVG(ttfg_sec)::numeric, 1) AS avg_ttfg_sec
  FROM ttfg
  GROUP BY cohort, source
  ORDER BY cohort, source
`;

export async function GET(request: NextRequest) {
  try {
    const summary = request.nextUrl.searchParams.get('summary');
    const db = await getDb();

    if (summary === 'ttfg') {
      const result = await db.execute(TTFG_SUMMARY_SQL);
      // postgres-js: execute 는 배열 형태 rows 반환.
      const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
      return NextResponse.json({ cohorts: rows });
    }

    // 기본: 최근 이벤트 200건(디버그/계측 확인용).
    const rows = await db.query.patternEvents.findMany({
      orderBy: (e, { desc }) => [desc(e.createdAt)],
      limit: 200,
    });
    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}
