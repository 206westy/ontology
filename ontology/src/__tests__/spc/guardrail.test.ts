import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// PRD-PF-F 최우선 경계(실패조건): 통계 계산은 lib/spc·lib/fdc(엔진)에만.
// 그래프/Cypher/AST 경로가 통계 엔진을 임포트하거나 통계식을 하드코딩하면 이 테스트가 실패한다.
// vitest 는 앱 루트에서 실행 → src 는 cwd/src.
const SRC = join(process.cwd(), 'src').replace(/\\/g, '/');

// 통계 엔진 임포트가 허용되는 경로(엔진·엔진 위임 헬퍼·전용 라우트·전용 UI·테스트).
const ALLOWED = [
  'lib/spc',
  'lib/fdc',
  'lib/functions/spc-eval',
  'lib/functions/fdc-eval',
  'app/api/spc',
  'app/api/fdc',
  'app/api/spc-rulesets',
  'app/api/spec-limits',
  'app/api/llm/spc-suggest', // 결정론 관리도·룰셋 초안(SPC 도메인)
  'app/api/functions', // evaluate 라우트가 엔진 위임
  'features/spc',
  'features/fdc',
  '__tests__',
];

// 통계 엔진을 임포트하는 시그니처.
const ENGINE_IMPORT = /from\s+['"]@\/lib\/(spc|fdc)(\/[^'"]*)?['"]|@\/lib\/functions\/(spc|fdc)-eval/;

// 그래프/Cypher 경로에 절대 나타나선 안 되는 통계 심볼(하드코딩 방지).
const FORBIDDEN_IN_GRAPH = /\b(evaluateSpc|computeCapability|computeXbarR|computeImr|\bCpk\b)\b/;
const GRAPH_DIRS = ['lib/neo4j', 'features/ontology/lib/rag'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = `${dir}/${name}`;
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function rel(full: string): string {
  return full.slice(SRC.length).replace(/\\/g, '/').replace(/^\/+/, '');
}

describe('SPC/FDC 역할 경계 가드레일', () => {
  const files = walk(SRC.replace(/\\/g, '/'));

  it('통계 엔진은 허용된 경로에서만 임포트된다', () => {
    const violations: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      if (!ENGINE_IMPORT.test(content)) continue;
      const r = rel(f);
      if (!ALLOWED.some((a) => r.includes(a))) violations.push(r);
    }
    expect(violations).toEqual([]);
  });

  it('그래프/Cypher 경로에 통계 계산 심볼이 하드코딩되지 않는다', () => {
    const violations: string[] = [];
    for (const f of files) {
      const r = rel(f);
      if (!GRAPH_DIRS.some((g) => r.includes(g))) continue;
      if (FORBIDDEN_IN_GRAPH.test(readFileSync(f, 'utf8'))) violations.push(r);
    }
    expect(violations).toEqual([]);
  });
});
