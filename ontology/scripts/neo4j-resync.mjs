// Neo4j 반영본을 "현재 Supabase 상태"로 통째로 재구성한다(full resync).
//
// 왜: 기본 push 는 커밋 재생(replay)이라, Neo4j 인스턴스를 새로 갈거나(도커→Desktop)
// 커밋 로그에 빠진 엔티티가 있으면 반영본이 현재 상태와 어긋난다(예: 커밋 detail 없는
// relation_type 누락). resync 는 커밋을 무시하고 현재 테이블을 그대로 투영해 1:1 을 보장한다.
//
// 방식: 각 현재 엔티티를 synthetic ADD CommitDetail 로 만들어 앱과 "동일한"
// buildCypherStatements 를 태운다(중복 로직 없음 → 항상 push 와 일치, 한글 관계 등 동일).
// 도메인 노드(Class/Instance/RelationType)+그 관계를 지우고 재생성한다. _SyncState 는 보존.
//
// 실행:  npm run neo4j:resync            (env 지정: -- .env.prod)
// 주의: Supabase(DATABASE_URL) 와 Neo4j 양쪽에 접근 가능한 환경에서 실행.

// ── 회사망(Somansa) CA: NODE_EXTRA_CA_CERTS 는 부팅 시 1회만 읽힘 → 없으면 CA 주입 후 자신을 재실행.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const caPath = path.resolve(__dir, '..', 'certs', 'somansa-root-ca.pem');
if (!process.env.NODE_EXTRA_CA_CERTS && existsSync(caPath)) {
  const res = spawnSync(
    process.execPath,
    [...process.execArgv, ...process.argv.slice(1)],
    { stdio: 'inherit', env: { ...process.env, NODE_EXTRA_CA_CERTS: caPath } },
  );
  process.exit(res.status ?? 0);
}

import neo4j from 'neo4j-driver';
import postgres from 'postgres';
import { buildCypherStatements } from '@/lib/neo4j/cypher-builder';

// ── env 로드 (.env.local 또는 인자)
const envPath = path.resolve(process.cwd(), process.argv[2] ?? '.env.local');
function loadEnv(p) {
  const env = {};
  let raw;
  try {
    raw = readFileSync(p, 'utf8');
  } catch {
    console.error(`env 파일을 찾을 수 없습니다: ${p}`);
    process.exit(1);
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].trim();
  }
  return env;
}
const env = loadEnv(envPath);
const { DATABASE_URL, NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD } = env;
if (!DATABASE_URL || !NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
  console.error('DATABASE_URL / NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD 가 모두 필요합니다.');
  process.exit(1);
}

console.log(`env : ${envPath}`);
console.log(`PG  : ${DATABASE_URL.replace(/:[^:@/]+@/, ':****@')}`);
console.log(`Neo : ${NEO4J_URI} (user: ${NEO4J_USERNAME})`);

const sqlc = postgres(DATABASE_URL, { prepare: false, connect_timeout: 10 });
const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD),
  { connectionTimeout: 8000 },
);

const num = (v) => (v && typeof v.toNumber === 'function' ? v.toNumber() : Number(v));
const parseEmb = (e) => {
  if (e == null) return null;
  try {
    const arr = typeof e === 'string' ? JSON.parse(e) : e;
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch {
    return null;
  }
};

try {
  await driver.getServerInfo();

  // ── 1. 현재 Supabase 상태 조회
  const [classesRows, instanceRows, relTypeRows, edgeRows, propRows, ivalRows, attrRows] =
    await Promise.all([
      sqlc`SELECT id, name, description, color, parent_id, partition_id, embedding FROM classes`,
      sqlc`SELECT id, name, class_id, description, embedding FROM instances`,
      sqlc`SELECT id, name, description, category, source_class_id, target_class_id FROM relation_types`,
      sqlc`SELECT e.id, e.source_id, e.target_id, e.relation_type_id, e.is_bridge,
                  e.min_cardinality, e.max_cardinality, e.source_kind, e.target_kind,
                  e.category_confidence, rt.name AS relation_type_name
             FROM edges e JOIN relation_types rt ON rt.id = e.relation_type_id`,
      sqlc`SELECT id, class_id, name, data_type, is_required, enum_values
             FROM properties ORDER BY class_id, sort_order`,
      sqlc`SELECT instance_id, property_id, value FROM instance_values`,
      sqlc`SELECT DISTINCT ON (target_table, target_id)
                  target_table, target_id, source_type, confidence, source_ref
             FROM attributions ORDER BY target_table, target_id, created_at DESC`,
    ]);

  // ── 2. PushContext 구성 (프로퍼티/값/어트리뷰션/임베딩) — push 라우트와 동일 형태
  const context = {
    propertiesByClass: {},
    propertyById: {},
    instanceValuesByInstance: {},
    attributions: {},
    embeddings: {},
  };
  for (const p of propRows) {
    const meta = {
      id: p.id,
      name: p.name,
      dataType: p.data_type,
      isRequired: p.is_required,
      enumValues: p.enum_values ?? null,
    };
    (context.propertiesByClass[p.class_id] ??= []).push(meta);
    context.propertyById[p.id] = meta;
  }
  for (const v of ivalRows) {
    (context.instanceValuesByInstance[v.instance_id] ??= []).push({
      propertyId: v.property_id,
      value: v.value ?? null,
    });
  }
  for (const a of attrRows) {
    context.attributions[`${a.target_table}:${a.target_id}`] = {
      sourceType: a.source_type,
      confidence: a.confidence ?? null,
      sourceRef: a.source_ref ?? null,
    };
  }
  for (const c of classesRows) {
    const emb = parseEmb(c.embedding);
    if (emb) context.embeddings[c.id] = emb;
  }
  for (const i of instanceRows) {
    const emb = parseEmb(i.embedding);
    if (emb) context.embeddings[i.id] = emb;
  }

  // ── 3. synthetic ADD details 구성
  // 클래스는 부모→자식 순(depth 오름차순)이라야 IS_A MATCH 가 같은 트랜잭션 안에서 부모를 찾는다.
  const byId = new Map(classesRows.map((c) => [c.id, c]));
  const depthOf = (c) => {
    let d = 0;
    let cur = c;
    let guard = 0;
    while (cur?.parent_id && byId.has(cur.parent_id) && guard++ < 1000) {
      d++;
      cur = byId.get(cur.parent_id);
    }
    return d;
  };
  const sortedClasses = [...classesRows].sort((a, b) => depthOf(a) - depthOf(b));

  const details = [];
  for (const c of sortedClasses)
    details.push({
      operation: 'ADD',
      targetTable: 'classes',
      targetId: c.id,
      afterSnapshot: {
        name: c.name,
        description: c.description ?? '',
        color: c.color,
        partitionId: c.partition_id,
        parentId: c.parent_id ?? null,
      },
    });
  for (const rt of relTypeRows)
    details.push({
      operation: 'ADD',
      targetTable: 'relation_types',
      targetId: rt.id,
      afterSnapshot: {
        name: rt.name,
        description: rt.description ?? '',
        category: rt.category,
        sourceClassId: rt.source_class_id ?? null,
        targetClassId: rt.target_class_id ?? null,
      },
    });
  for (const i of instanceRows)
    details.push({
      operation: 'ADD',
      targetTable: 'instances',
      targetId: i.id,
      afterSnapshot: {
        name: i.name,
        classId: i.class_id,
        description: i.description ?? '',
      },
    });
  for (const e of edgeRows)
    details.push({
      operation: 'ADD',
      targetTable: 'edges',
      targetId: e.id,
      afterSnapshot: {
        sourceId: e.source_id,
        targetId: e.target_id,
        relationTypeId: e.relation_type_id,
        relationTypeName: e.relation_type_name,
        isBridge: e.is_bridge,
        minCardinality: e.min_cardinality,
        maxCardinality: e.max_cardinality,
        sourceKind: e.source_kind,
        targetKind: e.target_kind,
        categoryConfidence: e.category_confidence,
      },
    });

  const statements = buildCypherStatements(details, context);
  console.log(
    `\n조회: classes ${classesRows.length}, instances ${instanceRows.length}, ` +
      `relation_types ${relTypeRows.length}, edges ${edgeRows.length}, ` +
      `properties ${propRows.length}, instance_values ${ivalRows.length}`,
  );
  console.log(`생성할 Cypher 구문: ${statements.length}`);

  // ── 4. 도메인 노드 삭제 + 재구성 (단일 트랜잭션, _SyncState 는 보존)
  const session = driver.session();
  let wiped = 0;
  try {
    await session.executeWrite(async (tx) => {
      const before = await tx.run(
        'MATCH (n) WHERE n:Class OR n:Instance OR n:RelationType RETURN count(n) AS c',
      );
      wiped = num(before.records[0].get('c'));
      await tx.run(
        'MATCH (n) WHERE n:Class OR n:Instance OR n:RelationType DETACH DELETE n',
      );
      for (const s of statements) {
        await tx.run(s.query, s.params);
      }
    });
  } finally {
    await session.close();
  }
  console.log(`\n기존 도메인 노드 ${wiped}개 삭제 → 재구성 완료.`);

  // ── 5. 검증 리포트
  const verify = driver.session();
  try {
    const labels = await verify.run(
      'MATCH (n) UNWIND labels(n) AS L RETURN L AS label, count(DISTINCT n) AS c ORDER BY c DESC',
    );
    const rels = await verify.run(
      'MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS c ORDER BY c DESC',
    );
    console.log('\n라벨별 노드수:');
    for (const rec of labels.records)
      console.log(`  ${rec.get('label')} : ${num(rec.get('c'))}`);
    console.log('관계 타입별:');
    for (const rec of rels.records)
      console.log(`  ${rec.get('rel')} : ${num(rec.get('c'))}`);
  } finally {
    await verify.close();
  }

  console.log('\n✅ resync 완료 — Neo4j 반영본이 현재 Supabase 상태와 일치합니다.');
} catch (e) {
  console.error(`\n❌ resync 실패: ${e.message}`);
  process.exitCode = 1;
} finally {
  await sqlc.end({ timeout: 5 });
  await driver.close();
}
