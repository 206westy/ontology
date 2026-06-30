import { NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { getNeo4jDriver } from '@/lib/neo4j/client';
import {
  buildSupabaseSnapshot,
  buildNeo4jSnapshot,
  diffSnapshots,
} from '@/lib/neo4j/reconcile';

// PRD-E P1-4: Supabase ↔ Neo4j 무손실 대조. { ok, diffs } 반환.
export async function POST() {
  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    const db = await getDb();
    const [supabase, neo4j] = await Promise.all([
      buildSupabaseSnapshot(db),
      buildNeo4jSnapshot(session),
    ]);
    const diffs = diffSnapshots(supabase, neo4j);
    return NextResponse.json({
      ok: diffs.length === 0,
      diffs,
      supabaseCounts: supabase.counts,
      neo4jCounts: neo4j.counts,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: '정합 검증에 실패했습니다.',
        suggestion: 'Supabase/Neo4j 연결 상태를 확인해주세요.',
        detail: err instanceof Error ? err.message : undefined,
      },
      { status: 500 },
    );
  } finally {
    await session.close();
  }
}
