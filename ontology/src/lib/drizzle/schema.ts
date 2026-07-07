import {
  pgTable,
  uuid,
  text,
  boolean,
  real,
  integer,
  jsonb,
  timestamp,
  primaryKey,
  unique,
  index,
  check,
  vector,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─── partitions (PRD-B B-1: 구획 / Named Graph 논리 분리) ───
export const partitions = pgTable(
  'partitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    color: text('color').notNull().default('#2563eb'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('uq_partition_name').on(t.name),
    check('chk_partition_color_hex', sql`${t.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

export const partitionsRelations = relations(partitions, ({ many }) => ({
  classes: many(classes),
}));

// ─── classes ───────────────────────────────────────────────
export const classes = pgTable(
  'classes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id').references((): any => classes.id, {
      onDelete: 'set null',
    }),
    // PRD-B B-1: 소속 구획 (NOT NULL, 기본 구획 default + 백필됨)
    partitionId: uuid('partition_id')
      .notNull()
      .default('00000000-0000-0000-0000-000000000001')
      .references(() => partitions.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description').default(''),
    color: text('color').notNull().default('#7c3aed'),
    namespace: text('namespace'),
    positionX: real('position_x').notNull().default(0),
    positionY: real('position_y').notNull().default(0),
    // A-4 provenance (nullable): where this node/its enrichment came from.
    sourceType: text('source_type'),
    confidence: real('confidence'),
    evidence: text('evidence'),
    // PRD-E P1-1: dedup·RAG 임베딩 (text-embedding-3-small, 1536). 생성은 P2.
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('uq_class_name_per_parent').on(t.parentId, t.name),
    index('idx_classes_parent').on(t.parentId),
    index('idx_classes_partition').on(t.partitionId),
    check('chk_color_hex', sql`${t.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

export const classesRelations = relations(classes, ({ one, many }) => ({
  parent: one(classes, {
    fields: [classes.parentId],
    references: [classes.id],
    relationName: 'classHierarchy',
  }),
  partition: one(partitions, {
    fields: [classes.partitionId],
    references: [partitions.id],
  }),
  children: many(classes, { relationName: 'classHierarchy' }),
  properties: many(properties),
  instances: many(instances),
  axiomClasses: many(axiomClasses),
  constraintsAsSource: many(constraints, {
    relationName: 'constraintSourceClass',
  }),
  constraintsAsTarget: many(constraints, {
    relationName: 'constraintTargetClass',
  }),
}));

// ─── properties ────────────────────────────────────────────
export const properties = pgTable(
  'properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    dataType: text('data_type').notNull().default('string'),
    isRequired: boolean('is_required').notNull().default(false),
    enumValues: jsonb('enum_values'),
    constraintRule: jsonb('constraint_rule'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    unique('uq_property_per_class').on(t.classId, t.name),
    index('idx_properties_class').on(t.classId),
    check(
      'chk_data_type',
      sql`${t.dataType} IN ('string','integer','float','boolean','date','enum')`,
    ),
  ],
);

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  class: one(classes, {
    fields: [properties.classId],
    references: [classes.id],
  }),
  instanceValues: many(instanceValues),
  constraints: many(constraints),
}));

// ─── instances ─────────────────────────────────────────────
export const instances = pgTable(
  'instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // PRD-E P1-1: RAG 문맥용 설명.
    description: text('description').notNull().default(''),
    // PRD-E P1-1: dedup·RAG 임베딩 (text-embedding-3-small, 1536). 생성은 P2.
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('uq_instance_name_per_class').on(t.classId, t.name),
    index('idx_instances_class').on(t.classId),
  ],
);

export const instancesRelations = relations(instances, ({ one, many }) => ({
  class: one(classes, {
    fields: [instances.classId],
    references: [classes.id],
  }),
  values: many(instanceValues),
}));

// ─── instance_values (EAV) ─────────────────────────────────
export const instanceValues = pgTable(
  'instance_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => instances.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    value: text('value'),
  },
  (t) => [
    unique('uq_value_per_instance_property').on(t.instanceId, t.propertyId),
    index('idx_ival_instance').on(t.instanceId),
    index('idx_ival_property').on(t.propertyId),
  ],
);

export const instanceValuesRelations = relations(
  instanceValues,
  ({ one }) => ({
    instance: one(instances, {
      fields: [instanceValues.instanceId],
      references: [instances.id],
    }),
    property: one(properties, {
      fields: [instanceValues.propertyId],
      references: [properties.id],
    }),
  }),
);

// ─── relation_types ────────────────────────────────────────
export const relationTypes = pgTable(
  'relation_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    description: text('description').default(''),
    // PR1 (목표①): 액션 지향 분류. 기존 row 는 'descriptive' 백필.
    category: text('category').notNull().default('descriptive'),
    sourceClassId: uuid('source_class_id').references(() => classes.id, {
      onDelete: 'set null',
    }),
    targetClassId: uuid('target_class_id').references(() => classes.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'chk_relation_category',
      sql`${t.category} IN ('structural', 'causal', 'diagnostic', 'procedural', 'descriptive')`,
    ),
  ],
);

export const relationTypesRelations = relations(
  relationTypes,
  ({ one, many }) => ({
    sourceClass: one(classes, {
      fields: [relationTypes.sourceClassId],
      references: [classes.id],
      relationName: 'relationSourceClass',
    }),
    targetClass: one(classes, {
      fields: [relationTypes.targetClassId],
      references: [classes.id],
      relationName: 'relationTargetClass',
    }),
    edges: many(edges),
    constraints: many(constraints),
  }),
);

// ─── edges ─────────────────────────────────────────────────
export const edges = pgTable(
  'edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    relationTypeId: uuid('relation_type_id')
      .notNull()
      .references(() => relationTypes.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').notNull(),
    targetId: uuid('target_id').notNull(),
    sourceKind: text('source_kind').notNull(),
    targetKind: text('target_kind').notNull(),
    // PRD-B B-1: source/target 구획이 다르면 true (구획 간 bridge 연결)
    isBridge: boolean('is_bridge').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // v3: 관계별 카디널리티 (NULL = 제약 없음)
    minCardinality: integer('min_cardinality'),
    maxCardinality: integer('max_cardinality'),
    // A-4 provenance (nullable): where this relation came from.
    sourceType: text('source_type'),
    confidence: real('confidence'),
    evidence: text('evidence'),
    // PRD-F P4-1: category 판정 확신도(저신뢰는 traversal 비우선). nullable.
    categoryConfidence: real('category_confidence'),
  },
  (t) => [
    unique('uq_edge').on(t.relationTypeId, t.sourceId, t.targetId),
    index('idx_edges_source').on(t.sourceId),
    index('idx_edges_target').on(t.targetId),
    index('idx_edges_relation').on(t.relationTypeId),
    check(
      'chk_source_kind',
      sql`${t.sourceKind} IN ('class', 'instance')`,
    ),
    check(
      'chk_target_kind',
      sql`${t.targetKind} IN ('class', 'instance')`,
    ),
    check('chk_no_self_loop', sql`${t.sourceId} != ${t.targetId}`),
    check(
      'chk_min_cardinality',
      sql`${t.minCardinality} IS NULL OR ${t.minCardinality} >= 0`,
    ),
    check(
      'chk_max_cardinality',
      sql`${t.maxCardinality} IS NULL OR ${t.maxCardinality} >= 0`,
    ),
    check(
      'chk_cardinality_range',
      sql`${t.minCardinality} IS NULL OR ${t.maxCardinality} IS NULL OR ${t.maxCardinality} >= ${t.minCardinality}`,
    ),
  ],
);

export const edgesRelations = relations(edges, ({ one }) => ({
  relationType: one(relationTypes, {
    fields: [edges.relationTypeId],
    references: [relationTypes.id],
  }),
}));

// ─── axioms ────────────────────────────────────────────────
export const axioms = pgTable(
  'axioms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    description: text('description').notNull(),
    ruleLogic: jsonb('rule_logic').notNull().default({}),
    severity: text('severity').notNull().default('warning'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'chk_severity',
      sql`${t.severity} IN ('info', 'warning', 'error')`,
    ),
  ],
);

export const axiomsRelations = relations(axioms, ({ many }) => ({
  axiomClasses: many(axiomClasses),
}));

// ─── axiom_classes (M:N) ───────────────────────────────────
export const axiomClasses = pgTable(
  'axiom_classes',
  {
    axiomId: uuid('axiom_id')
      .notNull()
      .references(() => axioms.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.axiomId, t.classId] }),
    index('idx_ac_class').on(t.classId),
  ],
);

export const axiomClassesRelations = relations(axiomClasses, ({ one }) => ({
  axiom: one(axioms, {
    fields: [axiomClasses.axiomId],
    references: [axioms.id],
  }),
  class: one(classes, {
    fields: [axiomClasses.classId],
    references: [classes.id],
  }),
}));

// ─── branches (PRD-J M1: 온톨로지 GitFlow) ─────────────────
// 브랜치 = 분기 시점 그래프 스냅샷(base_snapshot) + 이후 커밋 체인.
// 엔티티 테이블은 항상 main 작업본. 'main'은 예약(행 없음, commits.branchId NULL 규약).
export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    authorId: uuid('author_id'),
    authorEmail: text('author_email'),
    baseCommitId: uuid('base_commit_id').references((): any => commits.id, {
      onDelete: 'set null',
    }),
    baseSnapshot: jsonb('base_snapshot').notNull(),
    status: text('status').notNull().default('active'),
    mergedAt: timestamp('merged_at', { withTimezone: true }),
    mergedBy: uuid('merged_by'),
    mergeCommitId: uuid('merge_commit_id').references((): any => commits.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('uq_branch_name').on(t.name),
    index('idx_branches_status').on(t.status),
    check('chk_branch_status', sql`${t.status} IN ('active', 'merged', 'abandoned')`),
    check('chk_branch_name_not_main', sql`lower(${t.name}) <> 'main'`),
  ],
);

export const branchesRelations = relations(branches, ({ many }) => ({
  commits: many(commits),
  mergeRequests: many(mergeRequests),
}));

// ─── merge_requests (PRD-J M3: 브랜치→main 리뷰 게이트) ─────
export const mergeRequests = pgTable(
  'merge_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    authorId: uuid('author_id'),
    authorEmail: text('author_email'),
    status: text('status').notNull().default('open'),
    reviewerId: uuid('reviewer_id'),
    reviewerEmail: text('reviewer_email'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    mergedAt: timestamp('merged_at', { withTimezone: true }),
    mergeCommitId: uuid('merge_commit_id').references((): any => commits.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_mr_status').on(t.status),
    index('idx_mr_branch').on(t.branchId),
    check(
      'chk_mr_status',
      sql`${t.status} IN ('open', 'approved', 'merged', 'closed')`,
    ),
  ],
);

export const mergeRequestsRelations = relations(mergeRequests, ({ one }) => ({
  branch: one(branches, {
    fields: [mergeRequests.branchId],
    references: [branches.id],
  }),
}));

// ─── commits ───────────────────────────────────────────────
export const commits = pgTable(
  'commits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    message: text('message').default(''),
    pushedToNeo4j: boolean('pushed_to_neo4j').notNull().default(false),
    pushedAt: timestamp('pushed_at', { withTimezone: true }),
    isAutoSave: boolean('is_auto_save').notNull().default(false),
    // PRD-J M1: NULL = main 커밋. 값 있으면 브랜치 커밋(main 미적용, 병합으로만 반영).
    branchId: uuid('branch_id').references((): any => branches.id, {
      onDelete: 'set null',
    }),
    authorId: uuid('author_id'),
    authorEmail: text('author_email'),
    parentCommitId: uuid('parent_commit_id').references((): any => commits.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('idx_commits_branch').on(t.branchId)],
);

export const commitsRelations = relations(commits, ({ many, one }) => ({
  details: many(commitDetails),
  branch: one(branches, {
    fields: [commits.branchId],
    references: [branches.id],
  }),
}));

// ─── commit_details ────────────────────────────────────────
export const commitDetails = pgTable(
  'commit_details',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    commitId: uuid('commit_id')
      .notNull()
      .references(() => commits.id, { onDelete: 'cascade' }),
    operation: text('operation').notNull(),
    targetTable: text('target_table').notNull(),
    targetId: uuid('target_id').notNull(),
    beforeSnapshot: jsonb('before_snapshot'),
    afterSnapshot: jsonb('after_snapshot'),
    // PRD-J M2: 커밋 내 변경 순번(브랜치 재생·병합의 결정적 적용 순서). 과거 행은 NULL.
    seq: integer('seq'),
  },
  (t) => [
    index('idx_cd_commit').on(t.commitId),
    check(
      'chk_operation',
      sql`${t.operation} IN ('ADD', 'MOD', 'DEL')`,
    ),
  ],
);

export const commitDetailsRelations = relations(commitDetails, ({ one }) => ({
  commit: one(commits, {
    fields: [commitDetails.commitId],
    references: [commits.id],
  }),
}));

// ─── constraints (v3) ─────────────────────────────────────
// 제약 조건 유형: cardinality, disjoint, domain_range, property_value
export const constraints = pgTable(
  'constraints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    constraintType: text('constraint_type').notNull(),
    description: text('description').notNull().default(''),
    sourceClassId: uuid('source_class_id').references(() => classes.id, {
      onDelete: 'cascade',
    }),
    targetClassId: uuid('target_class_id').references(() => classes.id, {
      onDelete: 'cascade',
    }),
    relationTypeId: uuid('relation_type_id').references(
      () => relationTypes.id,
      { onDelete: 'cascade' },
    ),
    propertyId: uuid('property_id').references(() => properties.id, {
      onDelete: 'cascade',
    }),
    config: jsonb('config').notNull().default({}),
    severity: text('severity').notNull().default('error'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'chk_constraint_type',
      sql`${t.constraintType} IN ('cardinality', 'disjoint', 'domain_range', 'property_value')`,
    ),
    check(
      'chk_constraint_severity',
      sql`${t.severity} IN ('info', 'warning', 'error')`,
    ),
    index('idx_constraints_type').on(t.constraintType),
    index('idx_constraints_source_class').on(t.sourceClassId),
    index('idx_constraints_target_class').on(t.targetClassId),
    index('idx_constraints_relation_type').on(t.relationTypeId),
    index('idx_constraints_property').on(t.propertyId),
  ],
);

export const constraintsRelations = relations(constraints, ({ one }) => ({
  sourceClass: one(classes, {
    fields: [constraints.sourceClassId],
    references: [classes.id],
    relationName: 'constraintSourceClass',
  }),
  targetClass: one(classes, {
    fields: [constraints.targetClassId],
    references: [classes.id],
    relationName: 'constraintTargetClass',
  }),
  relationType: one(relationTypes, {
    fields: [constraints.relationTypeId],
    references: [relationTypes.id],
  }),
  property: one(properties, {
    fields: [constraints.propertyId],
    references: [properties.id],
  }),
}));

// ─── validation_results (v3) ──────────────────────────────
// 유효성 검사 결과 캐시 — 검증 run 단위로 결과 저장
export const validationResults = pgTable(
  'validation_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id').notNull(),
    severity: text('severity').notNull(),
    ruleCode: text('rule_code').notNull(),
    message: text('message').notNull(),
    targetTable: text('target_table').notNull(),
    targetId: uuid('target_id').notNull(),
    constraintId: uuid('constraint_id').references(() => constraints.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'chk_vr_severity',
      sql`${t.severity} IN ('info', 'warning', 'error')`,
    ),
    check(
      'chk_vr_target_table',
      sql`${t.targetTable} IN ('classes', 'instances', 'properties', 'edges', 'relation_types', 'constraints')`,
    ),
    index('idx_vr_run').on(t.runId),
    index('idx_vr_severity').on(t.severity),
    index('idx_vr_target').on(t.targetTable, t.targetId),
    index('idx_vr_constraint').on(t.constraintId),
  ],
);

export const validationResultsRelations = relations(
  validationResults,
  ({ one }) => ({
    constraint: one(constraints, {
      fields: [validationResults.constraintId],
      references: [constraints.id],
    }),
  }),
);

// ─── attributions (PRD-E P1-1: 다형성 출처 / 6요소 횡단 1급 요소) ──
// target_table + target_id 다형성 참조로 어떤 행이든 출처를 추적한다.
// Neo4j 푸시 시 _src/_conf/_srcRef 로 운반된다.
export const attributions = pgTable(
  'attributions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetTable: text('target_table').notNull(),
    targetId: uuid('target_id').notNull(),
    sourceType: text('source_type').notNull(),
    sourceRef: text('source_ref'),
    evidence: text('evidence'),
    confidence: real('confidence'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_attr_target').on(t.targetTable, t.targetId),
    check(
      'chk_attr_source_type',
      sql`${t.sourceType} IN ('document', 'sap', 'user', 'web', 'inferred')`,
    ),
    check(
      'chk_attr_target_table',
      sql`${t.targetTable} IN ('classes', 'instances', 'properties', 'edges', 'relation_types', 'axioms', 'constraints')`,
    ),
    check(
      'chk_attr_confidence',
      sql`${t.confidence} IS NULL OR (${t.confidence} >= 0 AND ${t.confidence} <= 1)`,
    ),
  ],
);

// ─── patterns (PRD-H H1/M1: 패턴 학습형 캐시) ──────────────────
// 도메인 설계 패턴(역할+관계+CQ+traversal)을 재사용·버전 가능한 번들로 보관.
// 발견 파이프라인(retrieve›adapt›synthesize)이 채우고, 같은 도메인은 재사용(수렴)한다.
export const patterns = pgTable(
  'patterns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    nameKo: text('name_ko').notNull().default(''),
    version: integer('version').notNull().default(1),
    domain: text('domain').notNull(),
    roles: jsonb('roles').notNull().default([]),
    relationTypes: jsonb('relation_types').notNull().default([]),
    competencyQuestions: jsonb('competency_questions').notNull().default([]),
    traversalTemplates: jsonb('traversal_templates').notNull().default([]),
    method: text('method').notNull().default('synthesized'),
    sourceRepo: text('source_repo'),
    sourceUri: text('source_uri'),
    sourceLabel: text('source_label'),
    license: text('license'),
    isDraft: boolean('is_draft').notNull().default(false),
    previousVersionId: uuid('previous_version_id').references(
      (): any => patterns.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('uq_pattern_key_version').on(t.key, t.version),
    index('idx_patterns_domain').on(t.domain),
    index('idx_patterns_key').on(t.key),
    check(
      'chk_pattern_method',
      sql`${t.method} IN ('retrieved', 'adapted', 'synthesized', 'bootstrap')`,
    ),
  ],
);

// ─── term_glossary (PRD-H H4/M3: 맥락 주입형 용어 해소 캐시) ─────
// 미정의·모호 용어(약어·은어)를 도메인 + 현재 온톨로지 맥락으로 좁혀 확정한 뜻을
// 도메인-스코프로 보관한다. 확정 결과를 캐시해 재검색 폭주를 막고 이후 추출·검색에 재주입한다.
export const termGlossary = pgTable(
  'term_glossary',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    domain: text('domain').notNull(),
    partitionId: uuid('partition_id').references(() => partitions.id, {
      onDelete: 'set null',
    }),
    term: text('term').notNull(),
    meaning: text('meaning').notNull(),
    source: text('source').notNull().default('user'),
    confidence: real('confidence'),
    evidence: text('evidence'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('uq_term_glossary_domain_term').on(t.domain, t.term),
    index('idx_term_glossary_domain').on(t.domain),
    check(
      'chk_term_glossary_source',
      sql`${t.source} IN ('internal', 'context', 'web', 'user')`,
    ),
  ],
);
