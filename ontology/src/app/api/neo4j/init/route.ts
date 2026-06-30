import { NextResponse } from 'next/server';
import { getNeo4jDriver } from '@/lib/neo4j/client';
import { bootstrapNeo4jSchema } from '@/lib/neo4j/schema';

// PRD-E P1-2: Neo4j 스키마 부트스트랩 (제약/인덱스/벡터 인덱스). idempotent.
export async function POST() {
  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    const { applied, skipped } = await bootstrapNeo4jSchema(session);
    return NextResponse.json({ success: true, applied, skipped });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: 'Neo4j 스키마 초기화에 실패했습니다.',
        suggestion:
          'Neo4j 연결과 버전(벡터 인덱스 지원 5.13+ 또는 2025.x)을 확인해주세요.',
        detail: err instanceof Error ? err.message : undefined,
      },
      { status: 500 },
    );
  } finally {
    await session.close();
  }
}
