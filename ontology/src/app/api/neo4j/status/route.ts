import { NextResponse } from 'next/server';
import { verifyNeo4jConnection } from '@/lib/neo4j/client';

export async function GET() {
  const result = await verifyNeo4jConnection();

  if (!result.connected) {
    return NextResponse.json(
      {
        connected: false,
        error: result.error,
        suggestion: 'Neo4j 연결 설정을 확인해주세요. 환경변수(NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD)가 올바른지 확인하세요.',
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    connected: true,
    serverInfo: result.serverInfo,
  });
}
