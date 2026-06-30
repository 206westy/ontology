import { describe, it, expect } from 'vitest';
import { EMBEDDING_DIMENSIONS } from '@/features/ontology/lib/embedding';
import { VECTOR_DIMENSIONS, SCHEMA_STATEMENTS } from '@/lib/neo4j/schema';
import { mapAttributionSourceType } from '@/lib/attribution';

// PRD-E P3-4: 스키마 계약 ↔ 코드 드리프트 감지. 위반 시 CI 빌드 실패.
describe('schema contract drift', () => {
  it('임베딩 차원이 Supabase·Neo4j 계약과 일치 (1536)', () => {
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
    expect(VECTOR_DIMENSIONS).toBe(EMBEDDING_DIMENSIONS);
  });

  it('Neo4j 부트스트랩에 :Concept 벡터 인덱스가 포함', () => {
    const hasVectorIndex = SCHEMA_STATEMENTS.some(
      (s) => s.query.includes('VECTOR INDEX') && s.query.includes('Concept'),
    );
    expect(hasVectorIndex).toBe(true);
  });

  it('어트리뷰션 source_type 매핑이 enrich/parse 값을 허용 enum 으로 정규화', () => {
    // attributions CHECK 허용: document|sap|user|web|inferred
    const allowed = new Set(['document', 'sap', 'user', 'web', 'inferred']);
    for (const s of [
      'session_doc',
      'existing_graph',
      'web',
      'inferred',
      'user',
      'document',
      'sap',
      null,
      'unknown',
    ]) {
      expect(allowed.has(mapAttributionSourceType(s))).toBe(true);
    }
  });
});
