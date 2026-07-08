import { describe, it, expect } from 'vitest';
import {
  compressDetails,
  batchStatements,
  buildBatchedCypherStatements,
  formatBatchedCypherPreview,
  BATCH_MAX_ROWS,
} from '@/lib/neo4j/cypher-batch';
import {
  buildCypherStatements,
  type CommitDetail,
} from '@/lib/neo4j/cypher-builder';

const CLASS_A = '11111111-1111-4111-8111-111111111111';
const CLASS_B = '22222222-2222-4222-8222-222222222222';
const INST_A = '33333333-3333-4333-8333-333333333333';

function classDetail(
  operation: CommitDetail['operation'],
  targetId: string,
  name: string,
  extra?: Record<string, unknown>,
): CommitDetail {
  const snap = { name, description: '', color: '#7c3aed', ...extra };
  return {
    operation,
    targetTable: 'classes',
    targetId,
    beforeSnapshot: operation === 'ADD' ? null : snap,
    afterSnapshot: operation === 'DEL' ? null : snap,
  };
}

describe('compressDetails (PRD-M M1)', () => {
  it('배치 내 ADD→MOD→DEL 은 전부 소거된다', () => {
    const out = compressDetails([
      classDetail('ADD', CLASS_A, 'VV'),
      classDetail('MOD', CLASS_A, 'VV2'),
      classDetail('DEL', CLASS_A, 'VV2'),
    ]);
    expect(out).toHaveLength(0);
  });

  it('MOD 연속은 마지막 스냅샷 1건으로 병합된다 (last-write-wins)', () => {
    const first = classDetail('MOD', CLASS_A, 'v1');
    const out = compressDetails([
      first,
      classDetail('MOD', CLASS_A, 'v2'),
      classDetail('MOD', CLASS_A, 'v3'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].operation).toBe('MOD');
    expect((out[0].afterSnapshot as { name: string }).name).toBe('v3');
    expect(out[0].beforeSnapshot).toBe(first.beforeSnapshot);
  });

  it('ADD→MOD 는 마지막 스냅샷을 담은 ADD 1건이 된다', () => {
    const out = compressDetails([
      classDetail('ADD', CLASS_A, 'v1'),
      classDetail('MOD', CLASS_A, 'v2'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].operation).toBe('ADD');
    expect((out[0].afterSnapshot as { name: string }).name).toBe('v2');
  });

  it('기발행 엔티티의 단독 DEL 은 보존된다', () => {
    const out = compressDetails([classDetail('DEL', CLASS_A, 'VV')]);
    expect(out).toHaveLength(1);
    expect(out[0].operation).toBe('DEL');
  });

  it('MOD→DEL(기발행 수정 후 삭제)은 DEL 1건으로 접힌다', () => {
    const out = compressDetails([
      classDetail('MOD', CLASS_A, 'v1'),
      classDetail('DEL', CLASS_A, 'v1'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].operation).toBe('DEL');
  });

  it('DEL→ADD(같은 id 재생성)는 upsert 1건으로 접힌다', () => {
    const out = compressDetails([
      classDetail('DEL', CLASS_A, 'old'),
      classDetail('ADD', CLASS_A, 'new'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].operation).toBe('MOD'); // MERGE upsert 라 ADD 와 동일 구문
    expect((out[0].afterSnapshot as { name: string }).name).toBe('new');
  });

  it('서로 다른 대상은 독립적으로 유지된다', () => {
    const out = compressDetails([
      classDetail('ADD', CLASS_A, 'A'),
      classDetail('ADD', CLASS_B, 'B'),
      classDetail('DEL', CLASS_A, 'A'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].targetId).toBe(CLASS_B);
  });
});

describe('batchStatements (PRD-M M2)', () => {
  it('같은 템플릿 구문을 UNWIND 1문장으로 병합한다', () => {
    const statements = buildCypherStatements([
      classDetail('ADD', CLASS_A, 'A'),
      classDetail('ADD', CLASS_B, 'B'),
    ]);
    const batched = batchStatements(statements);
    expect(batched).toHaveLength(1);
    expect(batched[0].query).toMatch(/^UNWIND \$rows AS row /);
    expect(batched[0].query).toContain('row.id');
    expect(batched[0].query).not.toContain('$id');
    const rows = batched[0].params.rows as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toEqual([CLASS_A, CLASS_B]);
    expect(batched[0].description).toContain('외 1건');
  });

  it('단건 그룹은 원 구문을 그대로 유지한다', () => {
    const statements = buildCypherStatements([classDetail('ADD', CLASS_A, 'A')]);
    const batched = batchStatements(statements);
    expect(batched).toHaveLength(1);
    expect(batched[0].query).not.toContain('UNWIND');
    expect(batched[0].params.id).toBe(CLASS_A);
  });

  it('INSTANCE_OF delete 가 merge 보다 먼저 실행된다 (그룹핑 순서 역전 방지)', () => {
    const addInstance: CommitDetail = {
      operation: 'ADD',
      targetTable: 'instances',
      targetId: '44444444-4444-4444-8444-444444444444',
      beforeSnapshot: null,
      afterSnapshot: { name: 'i1', classId: CLASS_A },
    };
    const reclassInstance: CommitDetail = {
      operation: 'MOD',
      targetTable: 'instances',
      targetId: INST_A,
      beforeSnapshot: { name: 'i2', classId: CLASS_A },
      afterSnapshot: { name: 'i2', classId: CLASS_B },
    };
    // ADD 가 먼저 등장 → merge 그룹이 먼저 형성되는 조건에서도 delete 가 앞서야 한다
    const batched = batchStatements(
      buildCypherStatements([addInstance, reclassInstance]),
    );
    const delIdx = batched.findIndex(
      (s) => s.query.includes('[r:INSTANCE_OF]') && s.query.includes('DELETE r'),
    );
    const mergeIdx = batched.findIndex((s) =>
      s.query.includes('MERGE (i)-[:INSTANCE_OF]'),
    );
    expect(delIdx).toBeGreaterThanOrEqual(0);
    expect(mergeIdx).toBeGreaterThanOrEqual(0);
    expect(delIdx).toBeLessThan(mergeIdx);
  });

  it('배치 상한을 넘으면 청크로 나뉜다', () => {
    const details = Array.from({ length: BATCH_MAX_ROWS + 1 }, (_, i) =>
      classDetail('ADD', `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`, `c${i}`),
    );
    const batched = batchStatements(buildCypherStatements(details));
    expect(batched).toHaveLength(2);
    expect((batched[0].params.rows as unknown[]).length).toBe(BATCH_MAX_ROWS);
    expect((batched[1].params.rows as unknown[]).length).toBe(1);
  });
});

describe('buildBatchedCypherStatements (압축+배칭 통합)', () => {
  it('"생성 후 전체 삭제" 시나리오는 상쇄되어 구문 0건이 된다', () => {
    const statements = buildBatchedCypherStatements(
      [
        classDetail('ADD', CLASS_A, 'A'),
        classDetail('ADD', CLASS_B, 'B'),
        classDetail('DEL', CLASS_A, 'A'),
        classDetail('DEL', CLASS_B, 'B'),
      ],
      undefined,
    );
    expect(statements).toHaveLength(0);
  });

  it('compress: false 면 압축 없이 전체 재생을 배칭한다', () => {
    const statements = buildBatchedCypherStatements(
      [classDetail('ADD', CLASS_A, 'A'), classDetail('DEL', CLASS_A, 'A')],
      undefined,
      { compress: false },
    );
    expect(statements.length).toBeGreaterThan(0);
  });
});

describe('formatBatchedCypherPreview (PRD-M M4)', () => {
  it('배치 구문은 행 수 요약과 첫 행 샘플로 표시한다', () => {
    const preview = formatBatchedCypherPreview([
      {
        query: 'UNWIND $rows AS row MERGE (n:Class {id: row.id})',
        params: {
          rows: [
            { id: CLASS_A, embedding: Array.from({ length: 1536 }, () => 0.1) },
            { id: CLASS_B, embedding: null },
          ],
        },
        description: '클래스 "A" 생성 외 1건',
      },
    ]);
    expect(preview).toContain('rows: 2건');
    expect(preview).toContain('[…1536개]');
    expect(preview).not.toContain('0.1,0.1');
  });

  it('단건 구문은 파라미터를 치환해 표시한다', () => {
    const preview = formatBatchedCypherPreview([
      {
        query: 'MATCH (n:Class {id: $id}) DETACH DELETE n',
        params: { id: CLASS_A },
        description: '클래스 삭제',
      },
    ]);
    expect(preview).toContain(`"${CLASS_A}"`);
    expect(preview).not.toContain('$id');
  });
});
