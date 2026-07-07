import { describe, it, expect } from 'vitest';
import {
  buildCypherStatements,
  buildRollbackStatements,
  formatCypherPreview,
  type CommitDetail,
  type PushContext,
} from '@/lib/neo4j/cypher-builder';

const classId = '00000000-0000-0000-0000-000000000001';
const parentId = '00000000-0000-0000-0000-000000000002';
const instanceId = '00000000-0000-0000-0000-000000000003';
const edgeId = '00000000-0000-0000-0000-000000000004';
const relTypeId = '00000000-0000-0000-0000-000000000005';
const propId = '00000000-0000-0000-0000-000000000006';

describe('buildCypherStatements', () => {
  it('generates MERGE for class ADD (재푸시 중복 방지)', () => {
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'classes',
        targetId: classId,
        afterSnapshot: { name: 'Equipment', description: '장비', color: '#7c3aed' },
      },
    ];
    const stmts = buildCypherStatements(details);
    expect(stmts.length).toBe(1);
    expect(stmts[0].query).toContain('MERGE (n:Class');
    expect(stmts[0].query).toContain('n:Concept');
    expect(stmts[0].params.name).toBe('Equipment');
  });

  it('generates IS_A relation when parentId is set', () => {
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'classes',
        targetId: classId,
        afterSnapshot: { name: 'DryAsher', description: '', color: '#2563eb', parentId },
      },
    ];
    const stmts = buildCypherStatements(details);
    expect(stmts.length).toBe(2);
    expect(stmts[1].query).toContain('IS_A');
    expect(stmts[1].params.parentId).toBe(parentId);
  });

  it('generates SET for class MOD', () => {
    const details: CommitDetail[] = [
      {
        operation: 'MOD',
        targetTable: 'classes',
        targetId: classId,
        beforeSnapshot: { name: 'Old', description: '', color: '#7c3aed' },
        afterSnapshot: { name: 'New', description: 'updated', color: '#2563eb' },
      },
    ];
    const stmts = buildCypherStatements(details);
    expect(stmts.length).toBe(1);
    expect(stmts[0].query).toContain('SET');
    expect(stmts[0].params.name).toBe('New');
  });

  it('generates DETACH DELETE for class DEL', () => {
    const details: CommitDetail[] = [
      {
        operation: 'DEL',
        targetTable: 'classes',
        targetId: classId,
        beforeSnapshot: { name: 'Equipment' },
      },
    ];
    const stmts = buildCypherStatements(details);
    expect(stmts.length).toBe(1);
    expect(stmts[0].query).toContain('DETACH DELETE');
  });

  it('generates MERGE for instance ADD with INSTANCE_OF edge', () => {
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'instances',
        targetId: instanceId,
        afterSnapshot: { name: 'SUPRA XP', classId },
      },
    ];
    const stmts = buildCypherStatements(details);
    expect(stmts.length).toBe(2);
    expect(stmts[0].query).toContain('MERGE (n:Instance');
    expect(stmts[0].query).toContain('n:Concept');
    expect(stmts[1].query).toContain('INSTANCE_OF');
  });

  it('generates edge creation with sanitized relation name (MERGE)', () => {
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'edges',
        targetId: edgeId,
        afterSnapshot: {
          sourceId: classId,
          targetId: parentId,
          relationTypeId: relTypeId,
          relationTypeName: 'located-at',
        },
      },
    ];
    const stmts = buildCypherStatements(details);
    expect(stmts.length).toBe(1);
    expect(stmts[0].query).toContain('LOCATED_AT');
    expect(stmts[0].query).toContain('MERGE (a)-[r:LOCATED_AT');
    expect(stmts[0].query).not.toContain('located-at');
  });

  it('preserves distinct Korean relation types with backticks (no `___` collapse)', () => {
    const mk = (id: string, relName: string): CommitDetail => ({
      operation: 'ADD',
      targetTable: 'edges',
      targetId: id,
      afterSnapshot: {
        sourceId: classId,
        targetId: parentId,
        relationTypeId: relTypeId,
        relationTypeName: relName,
      },
    });
    const a = buildCypherStatements([mk('11111111-1111-1111-1111-111111111111', '포함함')]);
    const b = buildCypherStatements([mk('22222222-2222-2222-2222-222222222222', '교체함')]);
    // 한글은 백틱으로 감싸 유효한 타입 + 문자 보존.
    expect(a[0].query).toContain('MERGE (a)-[r:`포함함`');
    expect(b[0].query).toContain('MERGE (a)-[r:`교체함`');
    // 서로 다른 관계는 서로 다른 타입이어야 한다(기존 버그: 둘 다 '___').
    expect(a[0].query).not.toContain('___');
    expect(a[0].query).not.toEqual(b[0].query);
  });

  it('sorts ADD before MOD before DEL', () => {
    const details: CommitDetail[] = [
      {
        operation: 'DEL',
        targetTable: 'classes',
        targetId: classId,
        beforeSnapshot: { name: 'ToDelete' },
      },
      {
        operation: 'ADD',
        targetTable: 'classes',
        targetId: parentId,
        afterSnapshot: { name: 'ToAdd', description: '', color: '#7c3aed' },
      },
    ];
    const stmts = buildCypherStatements(details);
    expect(stmts[0].description).toContain('ToAdd');
    expect(stmts[stmts.length - 1].description).toContain('ToDelete');
  });

  it('sorts classes before instances before edges within ADD', () => {
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'edges',
        targetId: edgeId,
        afterSnapshot: { sourceId: classId, targetId: parentId, relationTypeId: relTypeId, relationTypeName: 'uses' },
      },
      {
        operation: 'ADD',
        targetTable: 'instances',
        targetId: instanceId,
        afterSnapshot: { name: 'Inst1', classId },
      },
      {
        operation: 'ADD',
        targetTable: 'classes',
        targetId: classId,
        afterSnapshot: { name: 'Cls1', description: '', color: '#7c3aed' },
      },
    ];
    const stmts = buildCypherStatements(details);
    expect(stmts[0].query).toContain('MERGE (n:Class');
    const edgeStmt = stmts.find((s) => s.query.includes('USES'));
    expect(edgeStmt).toBeDefined();
  });

  // ─── PRD-E P1-3: 손실 제거 ────────────────────────────────

  it('flattens instance_values onto the node with type casting (processTemp=250)', () => {
    const context: PushContext = {
      propertyById: {
        [propId]: {
          id: propId,
          name: 'processTemp',
          dataType: 'integer',
          isRequired: false,
          enumValues: null,
        },
      },
      instanceValuesByInstance: {
        [instanceId]: [{ propertyId: propId, value: '250' }],
      },
    };
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'instances',
        targetId: instanceId,
        afterSnapshot: { name: 'Chuck', classId },
      },
    ];
    const stmts = buildCypherStatements(details, context);
    const valStmt = stmts.find((s) => s.query.includes('processTemp'));
    expect(valStmt).toBeDefined();
    expect(valStmt!.query).toContain('toInteger($value)');
    expect(valStmt!.params.value).toBe('250');
  });

  it('handles a standalone instance_values commit detail', () => {
    const context: PushContext = {
      propertyById: {
        [propId]: {
          id: propId,
          name: 'partNumber',
          dataType: 'string',
          isRequired: false,
          enumValues: null,
        },
      },
    };
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'instance_values',
        targetId: '00000000-0000-0000-0000-000000000099',
        afterSnapshot: { instanceId, propertyId: propId, value: 'KC0330655' },
      },
    ];
    const stmts = buildCypherStatements(details, context);
    expect(stmts.length).toBe(1);
    expect(stmts[0].query).toContain('partNumber');
    expect(stmts[0].params.value).toBe('KC0330655');
  });

  it('preserves property structure as propsSchema JSON (enum 보존)', () => {
    const context: PushContext = {
      propertiesByClass: {
        [classId]: [
          {
            id: propId,
            name: 'state',
            dataType: 'enum',
            isRequired: true,
            enumValues: ['on', 'off'],
          },
        ],
      },
    };
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'classes',
        targetId: classId,
        afterSnapshot: { name: 'Equipment', description: '', color: '#7c3aed' },
      },
    ];
    const stmts = buildCypherStatements(details, context);
    expect(stmts[0].query).toContain('propsSchema');
    const json = stmts[0].params.propsSchema as string;
    expect(JSON.parse(json)).toEqual([
      { name: 'state', dataType: 'enum', required: true, enumValues: ['on', 'off'] },
    ]);
  });

  it('rebuilds propsSchema when a property changes', () => {
    const context: PushContext = {
      propertiesByClass: {
        [classId]: [
          {
            id: propId,
            name: 'x',
            dataType: 'string',
            isRequired: false,
            enumValues: null,
          },
        ],
      },
    };
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'properties',
        targetId: propId,
        afterSnapshot: { classId, name: 'x', dataType: 'string' },
      },
    ];
    const stmts = buildCypherStatements(details, context);
    expect(stmts[0].query).toContain('SET c.propsSchema');
  });

  it('carries edge cardinality, domain/range kinds, and attribution', () => {
    const context: PushContext = {
      attributions: {
        [`edges:${edgeId}`]: {
          sourceType: 'document',
          confidence: 0.9,
          sourceRef: 'doc#1',
        },
      },
    };
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'edges',
        targetId: edgeId,
        afterSnapshot: {
          sourceId: classId,
          targetId: parentId,
          relationTypeId: relTypeId,
          relationTypeName: 'uses',
          minCardinality: 1,
          maxCardinality: 5,
          sourceKind: 'class',
          targetKind: 'class',
        },
      },
    ];
    const stmts = buildCypherStatements(details, context);
    expect(stmts[0].query).toContain('min_cardinality');
    expect(stmts[0].query).toContain('max_cardinality');
    expect(stmts[0].params.minCardinality).toBe(1);
    expect(stmts[0].params.maxCardinality).toBe(5);
    expect(stmts[0].params.sourceKind).toBe('class');
    expect(stmts[0].params.src).toBe('document');
    expect(stmts[0].params.conf).toBe(0.9);
    expect(stmts[0].params.srcRef).toBe('doc#1');
  });

  it('carries relation type domain/range', () => {
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'relation_types',
        targetId: relTypeId,
        afterSnapshot: {
          name: 'uses',
          description: '',
          sourceClassId: classId,
          targetClassId: parentId,
        },
      },
    ];
    const stmts = buildCypherStatements(details);
    expect(stmts[0].query).toContain('MERGE (rt:RelationType');
    expect(stmts[0].query).toContain('domainClassId');
    expect(stmts[0].query).toContain('rangeClassId');
    expect(stmts[0].params.domainClassId).toBe(classId);
    expect(stmts[0].params.rangeClassId).toBe(parentId);
  });

  // PRD-L M2: layer 가 Neo4j 까지 운반됨 (조용한 유실 금지).
  it('carries relation type layer to Neo4j', () => {
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'relation_types',
        targetId: relTypeId,
        afterSnapshot: {
          name: 'inspects',
          description: '',
          layer: 'kinetic',
          sourceClassId: classId,
          targetClassId: parentId,
        },
      },
    ];
    const stmts = buildCypherStatements(details);
    expect(stmts[0].query).toContain('rt.layer = $layer');
    expect(stmts[0].params.layer).toBe('kinetic');
  });

  it('defaults relation type layer to semantic when snapshot omits it', () => {
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'relation_types',
        targetId: relTypeId,
        afterSnapshot: { name: 'legacy', description: '' },
      },
    ];
    const stmts = buildCypherStatements(details);
    expect(stmts[0].params.layer).toBe('semantic');
  });

  // PRD-L M2: 과거 커밋의 category(5분류) 스냅샷은 layer 로 하위호환 변환된다.
  it('maps a legacy category snapshot to the 2-layer value', () => {
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'relation_types',
        targetId: relTypeId,
        afterSnapshot: { name: 'old_diag', description: '', category: 'diagnostic' },
      },
    ];
    const stmts = buildCypherStatements(details);
    expect(stmts[0].params.layer).toBe('kinetic');
  });

  it('carries node attribution (_src/_conf/_srcRef)', () => {
    const context: PushContext = {
      attributions: {
        [`classes:${classId}`]: {
          sourceType: 'user',
          confidence: 1,
          sourceRef: null,
        },
      },
    };
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'classes',
        targetId: classId,
        afterSnapshot: { name: 'Equipment', description: '', color: '#7c3aed' },
      },
    ];
    const stmts = buildCypherStatements(details, context);
    expect(stmts[0].query).toContain('_src');
    expect(stmts[0].params.src).toBe('user');
    expect(stmts[0].params.conf).toBe(1);
  });

  it('is idempotent across builds (same MERGE query)', () => {
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'classes',
        targetId: classId,
        afterSnapshot: { name: 'Equipment', description: '', color: '#7c3aed' },
      },
    ];
    const a = buildCypherStatements(details);
    const b = buildCypherStatements(details);
    expect(a[0].query).toBe(b[0].query);
    expect(a[0].query).toContain('MERGE');
  });
});

describe('buildRollbackStatements', () => {
  it('reverses ADD to DEL', () => {
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'classes',
        targetId: classId,
        afterSnapshot: { name: 'Equipment', description: '', color: '#7c3aed' },
      },
    ];
    const stmts = buildRollbackStatements(details);
    expect(stmts.length).toBe(1);
    expect(stmts[0].query).toContain('DETACH DELETE');
  });

  it('reverses DEL to ADD using before_snapshot', () => {
    const details: CommitDetail[] = [
      {
        operation: 'DEL',
        targetTable: 'classes',
        targetId: classId,
        beforeSnapshot: { name: 'Equipment', description: '장비', color: '#7c3aed' },
      },
    ];
    const stmts = buildRollbackStatements(details);
    expect(stmts.length).toBe(1);
    expect(stmts[0].query).toContain('MERGE (n:Class');
    expect(stmts[0].params.name).toBe('Equipment');
  });

  it('reverses MOD back to before_snapshot', () => {
    const details: CommitDetail[] = [
      {
        operation: 'MOD',
        targetTable: 'classes',
        targetId: classId,
        beforeSnapshot: { name: 'OldName', description: '', color: '#7c3aed' },
        afterSnapshot: { name: 'NewName', description: 'updated', color: '#2563eb' },
      },
    ];
    const stmts = buildRollbackStatements(details);
    expect(stmts.length).toBe(1);
    expect(stmts[0].params.name).toBe('OldName');
  });

  it('reverses in opposite order', () => {
    const details: CommitDetail[] = [
      {
        operation: 'ADD',
        targetTable: 'classes',
        targetId: classId,
        afterSnapshot: { name: 'First', description: '', color: '#7c3aed' },
      },
      {
        operation: 'ADD',
        targetTable: 'instances',
        targetId: instanceId,
        afterSnapshot: { name: 'Second', classId },
      },
    ];
    const stmts = buildRollbackStatements(details);
    expect(stmts[0].query).toContain('Instance');
    expect(stmts[stmts.length - 1].query).toContain('Class');
  });
});

describe('formatCypherPreview', () => {
  it('formats statements with descriptions and inlined params', () => {
    const stmts = buildCypherStatements([
      {
        operation: 'ADD',
        targetTable: 'classes',
        targetId: classId,
        afterSnapshot: { name: 'Test', description: 'desc', color: '#7c3aed' },
      },
    ]);
    const preview = formatCypherPreview(stmts);
    expect(preview).toContain('// 클래스 "Test" 생성');
    expect(preview).toContain('"Test"');
    expect(preview).toContain(';');
  });
});
