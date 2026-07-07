import type { CommitDetail, PushContext } from '@/lib/neo4j/cypher-builder';
import type { ModelSnapshot } from '@/lib/neo4j/reconcile';

// PRD-E P1-4: 6요소(어트리뷰션 포함) 전부를 담은 무손실 라운드트립 시드 픽스처.
// 1)클래스 2)프로퍼티(enum) 3)인스턴스+값 4)관계타입(domain/range) 5)엣지(cardinality)
// 6)어트리뷰션 + 규칙(constraints).

const PARTITION = '00000000-0000-0000-0000-000000000001';
export const FULL_MODEL_IDS = {
  equipment: 'aaaaaaaa-0000-0000-0000-000000000001',
  chuck: 'aaaaaaaa-0000-0000-0000-000000000002',
  propState: 'bbbbbbbb-0000-0000-0000-000000000001',
  propTemp: 'bbbbbbbb-0000-0000-0000-000000000002',
  instChuck1: 'cccccccc-0000-0000-0000-000000000001',
  valTemp: 'dddddddd-0000-0000-0000-000000000001',
  relUses: 'eeeeeeee-0000-0000-0000-000000000001',
  edgeUses: 'ffffffff-0000-0000-0000-000000000001',
  constraint: '22222222-0000-0000-0000-000000000001',
} as const;

const ID = FULL_MODEL_IDS;

// ─── 6요소 시드 (ADD commit details) ──────────────────────────
export const FULL_MODEL_DETAILS: CommitDetail[] = [
  // 1) 클래스 (계층)
  {
    operation: 'ADD',
    targetTable: 'classes',
    targetId: ID.equipment,
    afterSnapshot: {
      name: 'Equipment',
      description: '장비',
      color: '#7c3aed',
      partitionId: PARTITION,
      parentId: null,
    },
  },
  {
    operation: 'ADD',
    targetTable: 'classes',
    targetId: ID.chuck,
    afterSnapshot: {
      name: 'Chuck',
      description: '웨이퍼 척',
      color: '#2563eb',
      partitionId: PARTITION,
      parentId: ID.equipment,
    },
  },
  // 2) 프로퍼티 (enum + integer)
  {
    operation: 'ADD',
    targetTable: 'properties',
    targetId: ID.propState,
    afterSnapshot: {
      classId: ID.equipment,
      name: 'state',
      dataType: 'enum',
      isRequired: true,
      enumValues: ['on', 'off'],
    },
  },
  {
    operation: 'ADD',
    targetTable: 'properties',
    targetId: ID.propTemp,
    afterSnapshot: {
      classId: ID.chuck,
      name: 'processTemp',
      dataType: 'integer',
      isRequired: false,
      enumValues: null,
    },
  },
  // 3) 인스턴스 + 값
  {
    operation: 'ADD',
    targetTable: 'instances',
    targetId: ID.instChuck1,
    afterSnapshot: {
      name: 'Chuck #1',
      classId: ID.chuck,
      description: '1호기 척',
    },
  },
  {
    operation: 'ADD',
    targetTable: 'instance_values',
    targetId: ID.valTemp,
    afterSnapshot: {
      instanceId: ID.instChuck1,
      propertyId: ID.propTemp,
      value: '250',
    },
  },
  // 4) 관계 타입 (domain/range)
  {
    operation: 'ADD',
    targetTable: 'relation_types',
    targetId: ID.relUses,
    afterSnapshot: {
      name: 'uses',
      description: '사용',
      sourceClassId: ID.equipment,
      targetClassId: ID.chuck,
    },
  },
  // 5) 엣지 (cardinality)
  {
    operation: 'ADD',
    targetTable: 'edges',
    targetId: ID.edgeUses,
    afterSnapshot: {
      sourceId: ID.equipment,
      targetId: ID.chuck,
      relationTypeId: ID.relUses,
      relationTypeName: 'uses',
      sourceKind: 'class',
      targetKind: 'class',
      isBridge: false,
      minCardinality: 1,
      maxCardinality: 5,
    },
  },
];

// ─── 무손실 운반 context ──────────────────────────────────────
export const FULL_MODEL_CONTEXT: PushContext = {
  propertiesByClass: {
    [ID.equipment]: [
      {
        id: ID.propState,
        name: 'state',
        dataType: 'enum',
        isRequired: true,
        enumValues: ['on', 'off'],
      },
    ],
    [ID.chuck]: [
      {
        id: ID.propTemp,
        name: 'processTemp',
        dataType: 'integer',
        isRequired: false,
        enumValues: null,
      },
    ],
  },
  propertyById: {
    [ID.propState]: {
      id: ID.propState,
      name: 'state',
      dataType: 'enum',
      isRequired: true,
      enumValues: ['on', 'off'],
    },
    [ID.propTemp]: {
      id: ID.propTemp,
      name: 'processTemp',
      dataType: 'integer',
      isRequired: false,
      enumValues: null,
    },
  },
  instanceValuesByInstance: {
    [ID.instChuck1]: [{ propertyId: ID.propTemp, value: '250' }],
  },
  attributions: {
    [`classes:${ID.equipment}`]: { sourceType: 'document', confidence: 0.95, sourceRef: 'spec#1' },
    [`classes:${ID.chuck}`]: { sourceType: 'document', confidence: 0.9, sourceRef: 'spec#2' },
    [`instances:${ID.instChuck1}`]: { sourceType: 'sap', confidence: 1, sourceRef: 'SAP#42' },
    [`relation_types:${ID.relUses}`]: { sourceType: 'inferred', confidence: 0.6, sourceRef: null },
    [`edges:${ID.edgeUses}`]: { sourceType: 'document', confidence: 0.8, sourceRef: 'spec#3' },
  },
};

// ─── 기대 Supabase 스냅샷 (reconcile 대조용) ──────────────────
export const FULL_MODEL_SUPABASE_SNAPSHOT: ModelSnapshot = {
  counts: { classes: 2, instances: 1, relationTypes: 1, edges: 1 },
  instanceValues: { [ID.instChuck1]: 'processTemp=250' },
  attributions: {
    [`classes:${ID.equipment}`]: 'document',
    [`classes:${ID.chuck}`]: 'document',
    [`instances:${ID.instChuck1}`]: 'sap',
    [`relation_types:${ID.relUses}`]: 'inferred',
    [`edges:${ID.edgeUses}`]: 'document',
  },
};
