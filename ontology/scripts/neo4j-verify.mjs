// Neo4j 연결·스키마 준비 상태 점검 스크립트 (앱 없이도 실행 가능).
// 배포/컷오버 시 "지금 .env.local 값으로 Neo4j 에 붙는가 + 부트스트랩 됐는가"를
// 한 번에 확인한다. 부트스트랩 자체는 앱의 POST /api/neo4j/init 이 단일 소스이므로
// 여기서는 "검증만" 한다(스키마 구문 중복 금지).
//
// 사용법:
//   node scripts/neo4j-verify.mjs               # .env.local 사용
//   node scripts/neo4j-verify.mjs .env.prod     # 다른 env 파일 지정
//
// 종료코드: 연결 성공=0, 실패=1 (CI/배포 게이트에 사용 가능)

import neo4j from 'neo4j-driver';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), process.argv[2] ?? '.env.local');

// .env 파싱 — 주석/빈 줄 무시, 첫 정의 우선(뒤의 주석 처리된 중복 무시).
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
const uri = env.NEO4J_URI;
const user = env.NEO4J_USERNAME;
const pass = env.NEO4J_PASSWORD;

if (!uri || !user || !pass) {
  console.error('NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD 가 모두 필요합니다.');
  process.exit(1);
}

console.log(`env      : ${envPath}`);
console.log(`URI      : ${uri}  (user: ${user})`);

const driver = neo4j.driver(uri, neo4j.auth.basic(user, pass), {
  connectionTimeout: 8000,
});

const toPlain = (rec) =>
  JSON.stringify(rec.toObject(), (_k, v) =>
    v && typeof v === 'object' && 'low' in v && 'high' in v ? v.low : v,
  );

try {
  const info = await driver.getServerInfo();
  console.log(`CONNECTED: ${info.address}  ${info.agent}`);

  const session = driver.session();
  try {
    const count = await session.run('MATCH (n) RETURN count(n) AS total');
    console.log(`nodes    : ${count.records[0].get('total')}`);

    const idx = await session.run(
      "SHOW INDEXES YIELD name, type, state WHERE type = 'VECTOR' RETURN name, state",
    );
    if (idx.records.length === 0) {
      console.log('vector   : (없음) — POST /api/neo4j/init 로 부트스트랩 필요');
    } else {
      for (const r of idx.records) console.log(`vector   : ${toPlain(r)}`);
    }

    const labels = await session.run(
      'CALL db.labels() YIELD label RETURN collect(label) AS labels',
    );
    console.log(`labels   : ${JSON.stringify(labels.records[0]?.get('labels') ?? [])}`);
  } finally {
    await session.close();
  }

  console.log('\n✅ 연결 OK');
  await driver.close();
  process.exit(0);
} catch (e) {
  console.error(`\n❌ 연결 실패: ${e.message}`);
  console.error('확인: Neo4j 인스턴스 실행 여부 / 포트(bolt 7687) / 비밀번호 / URI 스킴');
  await driver.close();
  process.exit(1);
}
