// Neo4j 스키마 부트스트랩 — 로그인 없이 CLI 로 실행(신규 배포/컷오버용).
//
// 앱의 POST /api/neo4j/init 는 인증이 필요해 배포 초기(로그인 계정 없음)엔 못 쓴다.
// 이 스크립트는 동일한 SCHEMA_STATEMENTS 를 src/lib/neo4j/schema.ts 에서 그대로
// import 해 실행하므로 구문 중복(drift)이 없다. 제약/인덱스/벡터인덱스 모두 idempotent.
//
// 실행:  npm run neo4j:bootstrap        (권장 — 플래그 포함)
//   또는 node --experimental-strip-types scripts/neo4j-bootstrap.mjs
//   env 지정: npm run neo4j:bootstrap -- .env.prod

import neo4j from 'neo4j-driver';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const envPath = resolve(process.cwd(), process.argv[2] ?? '.env.local');

function loadEnv(path) {
  const env = {};
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`env 파일을 찾을 수 없습니다: ${path}`);
    process.exit(1);
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv(envPath);
const { NEO4J_URI: uri, NEO4J_USERNAME: user, NEO4J_PASSWORD: pass } = env;
if (!uri || !user || !pass) {
  console.error('NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD 가 모두 필요합니다.');
  process.exit(1);
}

// 스키마 구문은 앱 코드(단일 소스)에서 import — 중복 정의 금지.
const schemaUrl = pathToFileURL(
  resolve(process.cwd(), 'src/lib/neo4j/schema.ts'),
).href;
let SCHEMA_STATEMENTS;
try {
  ({ SCHEMA_STATEMENTS } = await import(schemaUrl));
} catch (e) {
  console.error('schema.ts import 실패 — --experimental-strip-types 플래그로 실행하세요.');
  console.error(e.message);
  process.exit(1);
}

console.log(`env : ${envPath}`);
console.log(`URI : ${uri} (user: ${user})`);

const driver = neo4j.driver(uri, neo4j.auth.basic(user, pass), {
  connectionTimeout: 8000,
});

try {
  await driver.getServerInfo();
} catch (e) {
  console.error(`\n❌ 연결 실패: ${e.message}`);
  await driver.close();
  process.exit(1);
}

const session = driver.session();
const applied = [];
const skipped = [];
try {
  for (const stmt of SCHEMA_STATEMENTS) {
    try {
      await session.run(stmt.query);
      applied.push(stmt.description);
      console.log(`  ✓ ${stmt.description}`);
    } catch (err) {
      skipped.push({ description: stmt.description, reason: err.message });
      console.log(`  ⚠ skip: ${stmt.description} — ${err.message}`);
    }
  }
} finally {
  await session.close();
  await driver.close();
}

console.log(`\n적용 ${applied.length} / 건너뜀 ${skipped.length}`);
console.log('✅ 부트스트랩 완료 (idempotent — 재실행 안전)');
