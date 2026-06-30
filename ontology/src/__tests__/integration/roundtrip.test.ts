import { describe, it, expect } from 'vitest';
import { buildCypherStatements } from '@/lib/neo4j/cypher-builder';
import { diffSnapshots, type ModelSnapshot } from '@/lib/neo4j/reconcile';
import {
  FULL_MODEL_DETAILS,
  FULL_MODEL_CONTEXT,
  FULL_MODEL_SUPABASE_SNAPSHOT,
  FULL_MODEL_IDS as ID,
} from '@/features/ontology/constants/fixtures/full-model';

describe('roundtrip — 6요소 무손실 적재 커버리지', () => {
  const statements = buildCypherStatements(FULL_MODEL_DETAILS, FULL_MODEL_CONTEXT);
  const allQueries = statements.map((s) => s.query).join('\n');

  it('클래스를 MERGE + :Concept 로 적재', () => {
    expect(allQueries).toContain('MERGE (n:Class');
    expect(allQueries).toContain('n:Concept');
  });

  it('프로퍼티 구조를 propsSchema JSON 으로 보존 (enum 살아있음)', () => {
    const propsStmt = statements.find(
      (s) => typeof s.params.propsSchema === 'string' && s.params.classId === ID.equipment,
    );
    // 클래스 ADD 에 propsSchema 가 실려야 한다
    const classStmt = statements.find(
      (s) => s.params.id === ID.equipment && typeof s.params.propsSchema === 'string',
    );
    const json = (classStmt?.params.propsSchema ?? propsStmt?.params.propsSchema) as string;
    expect(json).toBeTruthy();
    expect(JSON.parse(json)).toEqual([
      { name: 'state', dataType: 'enum', required: true, enumValues: ['on', 'off'] },
    ]);
  });

  it('인스턴스 값을 타입 캐스팅해 평탄화 (processTemp=250)', () => {
    const valStmt = statements.find((s) => s.query.includes('processTemp'));
    expect(valStmt).toBeDefined();
    expect(valStmt!.query).toContain('toInteger($value)');
    expect(valStmt!.params.value).toBe('250');
  });

  it('관계 타입에 domain/range 반영', () => {
    const rtStmt = statements.find((s) => s.query.includes('MERGE (rt:RelationType'));
    expect(rtStmt).toBeDefined();
    expect(rtStmt!.params.domainClassId).toBe(ID.equipment);
    expect(rtStmt!.params.rangeClassId).toBe(ID.chuck);
  });

  it('엣지에 cardinality + 출처 반영', () => {
    const edgeStmt = statements.find((s) => s.query.includes('MERGE (a)-[r:USES'));
    expect(edgeStmt).toBeDefined();
    expect(edgeStmt!.params.minCardinality).toBe(1);
    expect(edgeStmt!.params.maxCardinality).toBe(5);
    expect(edgeStmt!.params.src).toBe('document');
  });

  it('모든 노드/관계에 어트리뷰션(_src) 운반', () => {
    const eqClass = statements.find((s) => s.params.id === ID.equipment);
    expect(eqClass!.params.src).toBe('document');
    const inst = statements.find((s) => s.params.id === ID.instChuck1);
    expect(inst!.params.src).toBe('sap');
  });
});

describe('roundtrip — diff 탐지 (의도적 손실)', () => {
  it('무손실이면 diff 0', () => {
    const neo4j: ModelSnapshot = structuredClone(FULL_MODEL_SUPABASE_SNAPSHOT);
    expect(diffSnapshots(FULL_MODEL_SUPABASE_SNAPSHOT, neo4j)).toEqual([]);
  });

  it('인스턴스 값 손실 시 diff 탐지', () => {
    const lossy: ModelSnapshot = structuredClone(FULL_MODEL_SUPABASE_SNAPSHOT);
    lossy.instanceValues = {}; // 값 미적재 (P1-3 이전 상태 재현)
    const diffs = diffSnapshots(FULL_MODEL_SUPABASE_SNAPSHOT, lossy);
    expect(diffs.some((d) => d.kind === 'instance_values_mismatch')).toBe(true);
  });

  it('출처 손실 시 diff 탐지', () => {
    const lossy: ModelSnapshot = structuredClone(FULL_MODEL_SUPABASE_SNAPSHOT);
    delete lossy.attributions[`edges:${ID.edgeUses}`];
    const diffs = diffSnapshots(FULL_MODEL_SUPABASE_SNAPSHOT, lossy);
    expect(diffs.some((d) => d.kind === 'attribution_missing')).toBe(true);
  });

  it('노드 수 불일치 시 diff 탐지', () => {
    const lossy: ModelSnapshot = structuredClone(FULL_MODEL_SUPABASE_SNAPSHOT);
    lossy.counts.instances = 0;
    const diffs = diffSnapshots(FULL_MODEL_SUPABASE_SNAPSHOT, lossy);
    expect(diffs.some((d) => d.kind === 'count_mismatch')).toBe(true);
  });

  // 핵심 검증: cypher-builder 가 instance value 평탄화를 빠뜨리면(context 누락)
  // Neo4j 측 instanceValues 가 비어 reconcile 이 손실을 잡아낸다.
  it('context 에 값/프로퍼티 메타가 없으면 평탄화 구문이 생성되지 않는다', () => {
    const noValues = buildCypherStatements(FULL_MODEL_DETAILS, {
      ...FULL_MODEL_CONTEXT,
      instanceValuesByInstance: {},
      propertyById: {},
    });
    // 인스턴스 값 평탄화 구문(processTemp SET)이 없어야 한다 (= 손실 재현)
    const flattened = noValues.filter(
      (s) => s.query.includes('processTemp') && s.query.includes('SET i.'),
    );
    expect(flattened.length).toBe(0);
  });
});
