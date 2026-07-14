import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// PRD-PF-H 불변식: 제안 에이전트는 그래프(Neo4j)를 변경하지 않는다.
// 계약테스트 — agent/propose 라우트가 Neo4j(쓰기 포함)를 임포트하지 않음을 정적으로 보장.
const AGENT = join(process.cwd(), 'src/app/api/agent/propose/route.ts');

describe('제안 에이전트 읽기전용 가드레일', () => {
  const src = readFileSync(AGENT, 'utf8');

  it('Neo4j 드라이버/클라이언트를 임포트하지 않는다(그래프 불변)', () => {
    expect(src).not.toMatch(/@\/lib\/neo4j/);
    expect(src).not.toMatch(/getNeo4jDriver|write_neo4j|executeWrite/);
  });

  it('생성하는 제안은 항상 pending(미확정) — 자동 확정 금지', () => {
    expect(src).toMatch(/status:\s*'pending'/);
    expect(src).not.toMatch(/status:\s*'confirmed'/);
  });
});
