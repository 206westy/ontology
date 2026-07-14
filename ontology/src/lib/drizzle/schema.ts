import {
  pgTable,
  uuid,
  text,
  boolean,
  real,
  doublePrecision,
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

// ─── workspaces / ontologies / memberships (PRD-PF-A: 멀티 온톨로지 테넌시) ──
// 신뢰 경계(workspace) > 재사용 지식자산(ontology) > 멤버십(user×workspace role).
// 기존 단일 전역 그래프는 기본 워크스페이스/온톨로지(고정 UUID)로 귀속(M1 시드).
export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // PRD-PF-F: SPC/FDC 도메인 모듈 토글(기본 off = 선택적으로 켜지는 모듈).
    spcEnabled: boolean('spc_enabled').notNull().default(false),
    fdcEnabled: boolean('fdc_enabled').notNull().default(false),
  },
  (t) => [unique('uq_workspace_slug').on(t.slug)],
);

export const ontologies = pgTable(
  'ontologies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').notNull().default('active'),
    // M4에서 branches FK 배선(순환 회피). 현재는 컬럼만.
    defaultBranchId: uuid('default_branch_id'),
    forkedFromOntologyId: uuid('forked_from_ontology_id').references(
      (): any => ontologies.id,
      { onDelete: 'set null' },
    ),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('uq_ontology_slug_per_ws').on(t.workspaceId, t.slug),
    index('idx_ontologies_ws').on(t.workspaceId),
    check('chk_ontology_status', sql`${t.status} IN ('active','archived')`),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    role: text('role').notNull().default('editor'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index('idx_memberships_user').on(t.userId),
    check(
      'chk_membership_role',
      sql`${t.role} IN ('owner','admin','editor','viewer')`,
    ),
  ],
);

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  ontologies: many(ontologies),
  memberships: many(memberships),
}));

export const ontologiesRelations = relations(ontologies, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [ontologies.workspaceId],
    references: [workspaces.id],
  }),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [memberships.workspaceId],
    references: [workspaces.id],
  }),
}));

// ─── partitions (PRD-B B-1: 구획 / Named Graph 논리 분리) ───
export const partitions = pgTable(
  'partitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // PRD-PF-A M2: 소속 온톨로지(NOT NULL, 기본 온톨로지 default + 백필됨).
    ontologyId: uuid('ontology_id')
      .notNull()
      .default('22222222-2222-2222-2222-222222222222')
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    color: text('color').notNull().default('#2563eb'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('uq_partition_name_per_ontology').on(t.ontologyId, t.name),
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
    // PRD-PF-A M2: 소속 온톨로지(NOT NULL, 기본 온톨로지 default + 백필됨).
    ontologyId: uuid('ontology_id')
      .notNull()
      .default('22222222-2222-2222-2222-222222222222')
      .references(() => ontologies.id, { onDelete: 'cascade' }),
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
    ontologyId: uuid('ontology_id')
      .notNull()
      .default('22222222-2222-2222-2222-222222222222')
      .references(() => ontologies.id, { onDelete: 'cascade' }),
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
    ontologyId: uuid('ontology_id')
      .notNull()
      .default('22222222-2222-2222-2222-222222222222')
      .references(() => ontologies.id, { onDelete: 'cascade' }),
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
    ontologyId: uuid('ontology_id')
      .notNull()
      .default('22222222-2222-2222-2222-222222222222')
      .references(() => ontologies.id, { onDelete: 'cascade' }),
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
    ontologyId: uuid('ontology_id')
      .notNull()
      .default('22222222-2222-2222-2222-222222222222')
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').default(''),
    // PRD-L M2: 2레이어 분류(semantic|kinetic). 기존 row 는 'semantic' 백필.
    layer: text('layer').notNull().default('semantic'),
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
    unique('uq_relation_type_name_per_ontology').on(t.ontologyId, t.name),
    check(
      'chk_relation_layer',
      sql`${t.layer} IN ('semantic', 'kinetic')`,
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
    ontologyId: uuid('ontology_id')
      .notNull()
      .default('22222222-2222-2222-2222-222222222222')
      .references(() => ontologies.id, { onDelete: 'cascade' }),
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

// ─── (axioms/axiom_classes 제거됨 — PRD-L M1) ──────────────
// 자유서술 규칙은 constraints.kind='memo' 로 흡수(20260707000001_l_m1_unified_rules).

// ─── branches (PRD-J M1: 온톨로지 GitFlow) ─────────────────
// 브랜치 = 분기 시점 그래프 스냅샷(base_snapshot) + 이후 커밋 체인.
// 엔티티 테이블은 항상 main 작업본. 'main'은 예약(행 없음, commits.branchId NULL 규약).
export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ontologyId: uuid('ontology_id')
      .notNull()
      .default('22222222-2222-2222-2222-222222222222')
      .references(() => ontologies.id, { onDelete: 'cascade' }),
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
    unique('uq_branch_name_per_ontology').on(t.ontologyId, t.name),
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
    ontologyId: uuid('ontology_id')
      .notNull()
      .default('22222222-2222-2222-2222-222222222222')
      .references(() => ontologies.id, { onDelete: 'cascade' }),
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
    ontologyId: uuid('ontology_id')
      .notNull()
      .default('22222222-2222-2222-2222-222222222222')
      .references(() => ontologies.id, { onDelete: 'cascade' }),
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
    // PRD-N M5: 발행 시점 부여 — 시맨틱 버전 태그 + 구획별 변경 요약(발행 이력 구분).
    versionTag: text('version_tag'),
    changeSummary: jsonb('change_summary'),
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
    ontologyId: uuid('ontology_id')
      .notNull()
      .default('22222222-2222-2222-2222-222222222222')
      .references(() => ontologies.id, { onDelete: 'cascade' }),
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

// ─── constraints (v3 → PRD-L M1: 단일 "규칙" 정본) ─────────
// kind='enforced': 타입 규칙(cardinality, disjoint, domain_range, property_value) — 검증 대상.
// kind='memo': 자유서술 설명 메모(비강제) — constraintType NULL, description 만.
export const constraints = pgTable(
  'constraints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ontologyId: uuid('ontology_id')
      .notNull()
      .default('22222222-2222-2222-2222-222222222222')
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('enforced'),
    constraintType: text('constraint_type'),
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
      'chk_constraint_kind',
      sql`${t.kind} IN ('enforced', 'memo')`,
    ),
    check(
      'chk_constraint_type',
      sql`(${t.kind} = 'enforced' AND ${t.constraintType} IN ('cardinality', 'disjoint', 'domain_range', 'property_value')) OR (${t.kind} = 'memo' AND ${t.constraintType} IS NULL)`,
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
    ontologyId: uuid('ontology_id')
      .notNull()
      .default('22222222-2222-2222-2222-222222222222')
      .references(() => ontologies.id, { onDelete: 'cascade' }),
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
    ontologyId: uuid('ontology_id')
      .notNull()
      .default('22222222-2222-2222-2222-222222222222')
      .references(() => ontologies.id, { onDelete: 'cascade' }),
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
      sql`${t.targetTable} IN ('classes', 'instances', 'properties', 'edges', 'relation_types', 'constraints')`,
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
    // PRD-PF-A M2: 재사용 공유 자산 → 워크스페이스 스코프(nullable, NULL=공용 라이브러리).
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
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
    // PRD-BM-D01 (M0): 사용(시딩/재사용) 빈도 — 신뢰 신호·큐레이션.
    occurrenceCount: integer('occurrence_count').notNull().default(1),
    // PRD-BM-D01 (M1): 공유 스코프 + 헬스 점수(큐레이션).
    visibility: text('visibility').notNull().default('private'),
    health: real('health'),
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
    check(
      'chk_pattern_visibility',
      sql`${t.visibility} IN ('private', 'org', 'public')`,
    ),
    index('idx_patterns_visibility').on(t.visibility),
  ],
);

// ─── pattern_events (PRD-BM-D01 M0: 패턴 마켓플레이스 계측) ──────
// 세션/시딩/커밋 이벤트를 로깅해 TTFG(첫 그래프까지 시간)·활성화 델타를 숫자로 비교한다.
// 기존 인프라에 시계열 이벤트 로거가 없어 신규 테이블(attributions 는 provenance 전용).
export const patternEvents = pgTable(
  'pattern_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: text('session_id').notNull(),
    userId: uuid('user_id'),
    eventType: text('event_type').notNull(),
    patternId: uuid('pattern_id').references(() => patterns.id, {
      onDelete: 'set null',
    }),
    patternSource: text('pattern_source'),
    partitionId: uuid('partition_id'),
    props: jsonb('props').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_pattern_events_session').on(t.sessionId),
    index('idx_pattern_events_type_time').on(t.eventType, t.createdAt),
    check(
      'chk_pattern_event_type',
      sql`${t.eventType} IN ('session_started', 'free_input_started', 'pattern_seeded', 'first_commit')`,
    ),
    check(
      'chk_pattern_event_source',
      sql`${t.patternSource} IS NULL OR ${t.patternSource} IN ('cache', 'discovered', 'shared')`,
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
    // PRD-PF-A M2: 재사용 공유 자산 → 워크스페이스 스코프(nullable, NULL=공용).
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
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

// ─── relation_glossary (PRD-L M6/L7: 성장형 관계 어휘집 — 사후 정합 전용) ──
// AI 가 자유 추출한 관계 이름을 사후에 자생적으로 축적한다. 추출 프롬프트에 재주입 금지.
// 원본 term 은 절대 덮어쓰지 않고, 정규화 핸들(normalized_term·layer·meaning·similar_to)만 덧셈.
// 애매하면 새 항목이 기본값 — 임베딩 유사 항목은 similar_to 후보 링크만(자동 병합 아님).
export const relationGlossary = pgTable(
  'relation_glossary',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // PRD-PF-A M2: 재사용 공유 자산 → 워크스페이스 스코프(nullable, NULL=공용).
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    term: text('term').notNull(),
    normalizedTerm: text('normalized_term').notNull().unique(),
    layer: text('layer').notNull().default('semantic'),
    meaning: text('meaning').notNull().default(''),
    similarTo: uuid('similar_to').references((): any => relationGlossary.id, {
      onDelete: 'set null',
    }),
    occurrenceCount: integer('occurrence_count').notNull().default(1),
    sourceRef: text('source_ref'),
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_relation_glossary_layer').on(t.layer),
    check(
      'chk_relation_glossary_layer',
      sql`${t.layer} IN ('semantic', 'kinetic')`,
    ),
  ],
);

// ─── functions (PRD-PF-B: 일급 결정함수 — 속성을 읽어 판정 산출) ──
// 무결성 제약(constraints)과 목적 정반대(모델 유효성 vs 인스턴스 판정) → 별도 테이블(안 B).
// logic 은 선언적 AST(코드 아님, 화이트리스트 연산자). impl_type='ast'(Tier1)/'code'(Tier2, 후속).
export const functions = pgTable(
  'functions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ontologyId: uuid('ontology_id')
      .notNull()
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    targetClassId: uuid('target_class_id').references(() => classes.id, {
      onDelete: 'set null',
    }),
    inputs: jsonb('inputs').notNull().default([]),
    logic: jsonb('logic').notNull().default({}),
    outputSpec: jsonb('output_spec').notNull().default({}),
    nlSource: text('nl_source'),
    implType: text('impl_type').notNull().default('ast'),
    status: text('status').notNull().default('draft'),
    version: integer('version').notNull().default(1),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_functions_ontology').on(t.ontologyId),
    index('idx_functions_target_class').on(t.targetClassId),
    check('chk_function_impl_type', sql`${t.implType} IN ('ast','code')`),
    check(
      'chk_function_status',
      sql`${t.status} IN ('draft','confirmed','archived')`,
    ),
  ],
);

export const functionsRelations = relations(functions, ({ one, many }) => ({
  ontology: one(ontologies, {
    fields: [functions.ontologyId],
    references: [ontologies.id],
  }),
  targetClass: one(classes, {
    fields: [functions.targetClassId],
    references: [classes.id],
  }),
  results: many(decisionResults),
}));

// ─── decision_results (validation_results 형제 구조: 판정 결과 감사 적재) ──
// 순수·결정론: input_snapshot 해시(input_hash)로 동일 입력→동일 판정 재현 검증.
export const decisionResults = pgTable(
  'decision_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ontologyId: uuid('ontology_id')
      .notNull()
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    functionId: uuid('function_id')
      .notNull()
      .references(() => functions.id, { onDelete: 'cascade' }),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => instances.id, { onDelete: 'cascade' }),
    verdict: jsonb('verdict').notNull(),
    inputSnapshot: jsonb('input_snapshot').notNull().default({}),
    inputHash: text('input_hash').notNull(),
    functionVersion: integer('function_version').notNull().default(1),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_decision_results_function').on(t.functionId),
    index('idx_decision_results_instance').on(t.instanceId),
    index('idx_decision_results_ontology').on(t.ontologyId),
  ],
);

export const decisionResultsRelations = relations(
  decisionResults,
  ({ one }) => ({
    function: one(functions, {
      fields: [decisionResults.functionId],
      references: [functions.id],
    }),
    instance: one(instances, {
      fields: [decisionResults.instanceId],
      references: [instances.id],
    }),
  }),
);

// ─── problems (PRD-PF-C: 문제 최상위 스코프 — "무슨 문제를 푸는가") ──
// 워크스페이스 스코프(테넌시 경계). 스텝별 확정 상태를 workflow_state 에 누적.
export const problems = pgTable(
  'problems',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    // {name,target,unit,direction} — 측정지표.
    goalMetric: jsonb('goal_metric').notNull().default({}),
    // [{key,label}] — 사전정의 액션 슬롯(예: 통과/불통과).
    actionSlots: jsonb('action_slots').notNull().default([]),
    // [{question,decision,sourcePatternId?}] — patterns.competencyQuestions 에서 초안 복사(인스턴스화).
    decisionQuestions: jsonb('decision_questions').notNull().default([]),
    status: text('status').notNull().default('defining'),
    // {define,data,studio,functions,board: locked|draft|confirmed|stale (+ by/at)}.
    workflowState: jsonb('workflow_state').notNull().default({}),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_problems_workspace').on(t.workspaceId),
    check(
      'chk_problem_status',
      sql`${t.status} IN ('defining','in_progress','completed','archived')`,
    ),
  ],
);

// ─── problem_ontology_links (문제↔온톨로지 다대다 + 복리 재사용 계보) ──
// link_mode: new(신규)/reuse(참조)/extend(같은 트렁크 커밋)/branch(새 브랜치 격리).
export const problemOntologyLinks = pgTable(
  'problem_ontology_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    problemId: uuid('problem_id')
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),
    ontologyId: uuid('ontology_id')
      .notNull()
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    linkMode: text('link_mode').notNull(),
    branchId: uuid('branch_id').references(() => branches.id, {
      onDelete: 'set null',
    }),
    isPrimary: boolean('is_primary').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_pol_problem').on(t.problemId),
    index('idx_pol_ontology').on(t.ontologyId),
    check(
      'chk_pol_link_mode',
      sql`${t.linkMode} IN ('new','reuse','extend','branch')`,
    ),
  ],
);

export const problemsRelations = relations(problems, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [problems.workspaceId],
    references: [workspaces.id],
  }),
  ontologyLinks: many(problemOntologyLinks),
}));

export const problemOntologyLinksRelations = relations(
  problemOntologyLinks,
  ({ one }) => ({
    problem: one(problems, {
      fields: [problemOntologyLinks.problemId],
      references: [problems.id],
    }),
    ontology: one(ontologies, {
      fields: [problemOntologyLinks.ontologyId],
      references: [ontologies.id],
    }),
  }),
);

// ─── datasources / datasets (PRD-PF-D: 데이터셋 레지스트리 — 한 번 연결해 여러 문제가 재사용) ──
// 워크스페이스 스코프. 얇은 커넥터·읽기전용. 무거운 ETL·실시간 동기화는 스코프 아웃.
export const datasources = pgTable(
  'datasources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .default('11111111-1111-1111-1111-111111111111')
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    name: text('name').notNull(),
    // 자격증명은 앱레벨 암호화 후 저장(DB 평문 금지).
    connectionConfig: jsonb('connection_config').notNull().default({}),
    readOnly: boolean('read_only').notNull().default(true),
    lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_datasources_workspace').on(t.workspaceId),
    check(
      'chk_datasource_type',
      sql`${t.type} IN ('csv','db_view','table','parquet')`,
    ),
  ],
);

export const datasets = pgTable(
  'datasets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .default('11111111-1111-1111-1111-111111111111')
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    datasourceId: uuid('datasource_id').references(() => datasources.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    status: text('status').notNull().default('ready'),
    rowCount: integer('row_count'),
    storageRef: text('storage_ref'),
    checksum: text('checksum'),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('uq_dataset_name_per_ws').on(t.workspaceId, t.name),
    index('idx_datasets_workspace').on(t.workspaceId),
    check(
      'chk_dataset_status',
      sql`${t.status} IN ('ready','profiling','stale','error')`,
    ),
  ],
);

export const datasetColumns = pgTable(
  'dataset_columns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    ordinalPosition: integer('ordinal_position').notNull(),
    dataType: text('data_type').notNull().default('unknown'),
    nullable: boolean('nullable').notNull().default(true),
    missingRate: real('missing_rate'),
    distinctCount: integer('distinct_count'),
    sampleValues: jsonb('sample_values').notNull().default([]),
    minValue: text('min_value'),
    maxValue: text('max_value'),
    enumValues: jsonb('enum_values'),
    profiledAt: timestamp('profiled_at', { withTimezone: true }),
  },
  (t) => [
    unique('uq_dscol_name_per_dataset').on(t.datasetId, t.name),
    index('idx_dscol_dataset').on(t.datasetId),
    check(
      'chk_dscol_data_type',
      sql`${t.dataType} IN ('string','integer','float','boolean','date','datetime','enum','unknown')`,
    ),
  ],
);

// 컬럼 → 클래스/속성 매핑(데이터셋,온톨로지 단위). 자동확정 금지 — HITL 확인 필수.
export const datasetColumnMappings = pgTable(
  'dataset_column_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    datasetColumnId: uuid('dataset_column_id')
      .notNull()
      .references(() => datasetColumns.id, { onDelete: 'cascade' }),
    ontologyId: uuid('ontology_id')
      .notNull()
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetClassId: uuid('target_class_id').references(() => classes.id, {
      onDelete: 'cascade',
    }),
    targetPropertyId: uuid('target_property_id').references(() => properties.id, {
      onDelete: 'cascade',
    }),
    confidence: real('confidence'),
    source: text('source').notNull().default('user'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_dscm_column').on(t.datasetColumnId),
    index('idx_dscm_ontology').on(t.ontologyId),
    check('chk_dscm_target_type', sql`${t.targetType} IN ('class','property')`),
    check('chk_dscm_source', sql`${t.source} IN ('user','embedding_suggested')`),
  ],
);

// 문제↔데이터셋(재사용의 실체). onDelete restrict — 참조되는 데이터셋은 함부로 못 지운다.
export const problemDatasets = pgTable(
  'problem_datasets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    problemId: uuid('problem_id')
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'restrict' }),
    role: text('role').notNull().default('primary'),
    attachedBy: uuid('attached_by'),
    attachedAt: timestamp('attached_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('uq_problem_dataset').on(t.problemId, t.datasetId),
    index('idx_pd_problem').on(t.problemId),
    index('idx_pd_dataset').on(t.datasetId),
    check('chk_pd_role', sql`${t.role} IN ('primary','reference')`),
  ],
);

export const datasetsRelations = relations(datasets, ({ one, many }) => ({
  datasource: one(datasources, {
    fields: [datasets.datasourceId],
    references: [datasources.id],
  }),
  columns: many(datasetColumns),
  problemLinks: many(problemDatasets),
}));

export const datasetColumnsRelations = relations(
  datasetColumns,
  ({ one, many }) => ({
    dataset: one(datasets, {
      fields: [datasetColumns.datasetId],
      references: [datasets.id],
    }),
    mappings: many(datasetColumnMappings),
  }),
);

export const datasetColumnMappingsRelations = relations(
  datasetColumnMappings,
  ({ one }) => ({
    column: one(datasetColumns, {
      fields: [datasetColumnMappings.datasetColumnId],
      references: [datasetColumns.id],
    }),
  }),
);

export const problemDatasetsRelations = relations(
  problemDatasets,
  ({ one }) => ({
    problem: one(problems, {
      fields: [problemDatasets.problemId],
      references: [problems.id],
    }),
    dataset: one(datasets, {
      fields: [problemDatasets.datasetId],
      references: [datasets.id],
    }),
  }),
);

// ─── PRD-PF-F: SPC/FDC 통계 엔진 데이터모델 ──
// 통계=엔진(lib/spc·lib/fdc, JS 인프로세스), 온톨로지=조직·재사용·설명·근거화.
// spec_limits: 공정변수(=측정 속성)별 스펙. control_limits: 엔진 산출 관리한계(자동 재계산 금지).
export const specLimits = pgTable(
  'spec_limits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ontologyId: uuid('ontology_id')
      .notNull()
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    usl: doublePrecision('usl'),
    lsl: doublePrecision('lsl'),
    target: doublePrecision('target'),
    unit: text('unit'),
    revision: integer('revision').notNull().default(1),
    effectiveFrom: timestamp('effective_from', { withTimezone: true })
      .notNull()
      .defaultNow(),
    note: text('note'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_spec_limits_ontology').on(t.ontologyId),
    index('idx_spec_limits_property').on(t.propertyId),
    unique('uq_spec_limits_rev').on(t.propertyId, t.revision),
    check(
      'chk_spec_limits_bounds',
      sql`${t.usl} IS NULL OR ${t.lsl} IS NULL OR ${t.usl} >= ${t.lsl}`,
    ),
  ],
);

export const spcRulesets = pgTable(
  'spc_rulesets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ontologyId: uuid('ontology_id')
      .notNull()
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // 예: ["WE1","WE2","WE3","WE4","NELSON1",...] — 활성 룰 키 배열.
    rulesEnabled: jsonb('rules_enabled').notNull().default([]),
    ownerFunctionId: uuid('owner_function_id').references(() => functions.id, {
      onDelete: 'set null',
    }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('idx_spc_rulesets_ontology').on(t.ontologyId)],
);

export const controlLimits = pgTable(
  'control_limits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ontologyId: uuid('ontology_id')
      .notNull()
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    chartType: text('chart_type').notNull(),
    ucl: doublePrecision('ucl'),
    lcl: doublePrecision('lcl'),
    centerline: doublePrecision('centerline'),
    uclSecondary: doublePrecision('ucl_secondary'),
    lclSecondary: doublePrecision('lcl_secondary'),
    centerlineSecondary: doublePrecision('centerline_secondary'),
    subgroupSize: integer('subgroup_size').notNull().default(1),
    sampleCount: integer('sample_count'),
    sigma: doublePrecision('sigma'),
    computedAt: timestamp('computed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    computedBy: text('computed_by').notNull().default('js-spc@1'),
  },
  (t) => [
    index('idx_control_limits_ontology').on(t.ontologyId),
    index('idx_control_limits_property').on(
      t.propertyId,
      t.chartType,
      t.computedAt,
    ),
    check(
      'chk_control_limits_chart',
      sql`${t.chartType} IN ('xbar_r','i_mr','p','np','c','u')`,
    ),
  ],
);

export const spcRuns = pgTable(
  'spc_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ontologyId: uuid('ontology_id')
      .notNull()
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    functionId: uuid('function_id').references(() => functions.id, {
      onDelete: 'set null',
    }),
    propertyId: uuid('property_id').references(() => properties.id, {
      onDelete: 'set null',
    }),
    instanceId: uuid('instance_id').references(() => instances.id, {
      onDelete: 'set null',
    }),
    lotId: text('lot_id'),
    batchId: text('batch_id'),
    chartType: text('chart_type').notNull(),
    verdict: text('verdict').notNull(),
    violatedRules: jsonb('violated_rules').notNull().default([]),
    evidence: jsonb('evidence').notNull().default({}),
    controlLimitId: uuid('control_limit_id').references(
      () => controlLimits.id,
      { onDelete: 'set null' },
    ),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_spc_runs_ontology').on(t.ontologyId),
    index('idx_spc_runs_property').on(t.propertyId, t.evaluatedAt),
    index('idx_spc_runs_verdict').on(t.ontologyId, t.verdict),
    check('chk_spc_runs_verdict', sql`${t.verdict} IN ('pass','warn','fail')`),
    check(
      'chk_spc_runs_chart',
      sql`${t.chartType} IN ('xbar_r','i_mr','p','np','c','u')`,
    ),
  ],
);

export const fdcTraces = pgTable(
  'fdc_traces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ontologyId: uuid('ontology_id')
      .notNull()
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    functionId: uuid('function_id').references(() => functions.id, {
      onDelete: 'set null',
    }),
    equipmentInstanceId: uuid('equipment_instance_id').references(
      () => instances.id,
      { onDelete: 'set null' },
    ),
    sensorPropertyId: uuid('sensor_property_id').references(
      () => properties.id,
      { onDelete: 'set null' },
    ),
    detectionMethod: text('detection_method').notNull(),
    faultFlag: boolean('fault_flag').notNull().default(false),
    score: doublePrecision('score'),
    evidence: jsonb('evidence').notNull().default({}),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_fdc_traces_ontology').on(t.ontologyId),
    index('idx_fdc_traces_equipment').on(t.equipmentInstanceId),
    check('chk_fdc_method', sql`${t.detectionMethod} IN ('threshold','trend')`),
  ],
);

export const specLimitsRelations = relations(specLimits, ({ one }) => ({
  ontology: one(ontologies, {
    fields: [specLimits.ontologyId],
    references: [ontologies.id],
  }),
  property: one(properties, {
    fields: [specLimits.propertyId],
    references: [properties.id],
  }),
}));

export const spcRulesetsRelations = relations(spcRulesets, ({ one }) => ({
  ontology: one(ontologies, {
    fields: [spcRulesets.ontologyId],
    references: [ontologies.id],
  }),
  ownerFunction: one(functions, {
    fields: [spcRulesets.ownerFunctionId],
    references: [functions.id],
  }),
}));

export const controlLimitsRelations = relations(
  controlLimits,
  ({ one, many }) => ({
    ontology: one(ontologies, {
      fields: [controlLimits.ontologyId],
      references: [ontologies.id],
    }),
    property: one(properties, {
      fields: [controlLimits.propertyId],
      references: [properties.id],
    }),
    runs: many(spcRuns),
  }),
);

export const spcRunsRelations = relations(spcRuns, ({ one }) => ({
  ontology: one(ontologies, {
    fields: [spcRuns.ontologyId],
    references: [ontologies.id],
  }),
  function: one(functions, {
    fields: [spcRuns.functionId],
    references: [functions.id],
  }),
  property: one(properties, {
    fields: [spcRuns.propertyId],
    references: [properties.id],
  }),
  instance: one(instances, {
    fields: [spcRuns.instanceId],
    references: [instances.id],
  }),
  controlLimit: one(controlLimits, {
    fields: [spcRuns.controlLimitId],
    references: [controlLimits.id],
  }),
}));

export const fdcTracesRelations = relations(fdcTraces, ({ one }) => ({
  ontology: one(ontologies, {
    fields: [fdcTraces.ontologyId],
    references: [ontologies.id],
  }),
  function: one(functions, {
    fields: [fdcTraces.functionId],
    references: [functions.id],
  }),
  equipment: one(instances, {
    fields: [fdcTraces.equipmentInstanceId],
    references: [instances.id],
  }),
  sensor: one(properties, {
    fields: [fdcTraces.sensorPropertyId],
    references: [properties.id],
  }),
}));

// ─── PRD-PF-G: 대시보드(모니터링) · 액션보드(처리 큐) ──
// 결정함수/SPC 판정을 사람이 소비하는 화면. 위젯 config 는 라이브러리 중립(렌더러 어댑터가 ECharts로).
export const dashboards = pgTable(
  'dashboards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ontologyId: uuid('ontology_id')
      .notNull()
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    problemId: uuid('problem_id').references(() => problems.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    layout: jsonb('layout').notNull().default({}),
    isDefault: boolean('is_default').notNull().default(false),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_dashboards_ontology').on(t.ontologyId),
    index('idx_dashboards_problem').on(t.problemId),
  ],
);

export const dashboardWidgets = pgTable(
  'dashboard_widgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dashboardId: uuid('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'cascade' }),
    widgetType: text('widget_type').notNull(),
    title: text('title').notNull().default(''),
    sourceKind: text('source_kind').notNull(),
    sourceRef: jsonb('source_ref').notNull().default({}),
    config: jsonb('config').notNull().default({}),
    position: jsonb('position').notNull().default({}),
    refreshIntervalS: integer('refresh_interval_s').notNull().default(30),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_widgets_dashboard').on(t.dashboardId),
    check(
      'chk_widget_type',
      sql`${t.widgetType} IN ('control_chart','trend','histogram','kpi_card','anomaly_list')`,
    ),
    check(
      'chk_widget_source',
      sql`${t.sourceKind} IN ('decision_function','spc_series','instance_property')`,
    ),
  ],
);

export const actionItems = pgTable(
  'action_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ontologyId: uuid('ontology_id')
      .notNull()
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    problemId: uuid('problem_id').references(() => problems.id, {
      onDelete: 'set null',
    }),
    sourceFunctionId: uuid('source_function_id').references(() => functions.id, {
      onDelete: 'set null',
    }),
    subjectInstanceId: uuid('subject_instance_id').references(
      () => instances.id,
      { onDelete: 'set null' },
    ),
    verdict: text('verdict').notNull(),
    score: real('score'),
    evidence: jsonb('evidence').notNull().default({}),
    status: text('status').notNull().default('pending'),
    assignedTo: uuid('assigned_to'),
    resolvedBy: uuid('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionNote: text('resolution_note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_action_items_queue').on(t.ontologyId, t.status, t.verdict),
    index('idx_action_items_problem').on(t.problemId),
    index('idx_action_items_subject').on(t.subjectInstanceId),
    check('chk_action_verdict', sql`${t.verdict} IN ('fail','warn','pass')`),
    check(
      'chk_action_status',
      sql`${t.status} IN ('pending','in_review','confirmed','dismissed')`,
    ),
    // ★완전자동 금지★: 확정/기각은 반드시 행위자+사유 동반.
    check(
      'chk_action_resolution',
      sql`${t.status} IN ('pending','in_review') OR (${t.resolvedBy} IS NOT NULL AND ${t.resolutionNote} IS NOT NULL AND length(btrim(${t.resolutionNote})) > 0)`,
    ),
  ],
);

export const dashboardsRelations = relations(dashboards, ({ one, many }) => ({
  ontology: one(ontologies, {
    fields: [dashboards.ontologyId],
    references: [ontologies.id],
  }),
  problem: one(problems, {
    fields: [dashboards.problemId],
    references: [problems.id],
  }),
  widgets: many(dashboardWidgets),
}));

export const dashboardWidgetsRelations = relations(
  dashboardWidgets,
  ({ one }) => ({
    dashboard: one(dashboards, {
      fields: [dashboardWidgets.dashboardId],
      references: [dashboards.id],
    }),
  }),
);

export const actionItemsRelations = relations(actionItems, ({ one }) => ({
  ontology: one(ontologies, {
    fields: [actionItems.ontologyId],
    references: [ontologies.id],
  }),
  problem: one(problems, {
    fields: [actionItems.problemId],
    references: [problems.id],
  }),
  sourceFunction: one(functions, {
    fields: [actionItems.sourceFunctionId],
    references: [functions.id],
  }),
  subjectInstance: one(instances, {
    fields: [actionItems.subjectInstanceId],
    references: [instances.id],
  }),
}));

// ─── PRD-PF-H M1: 구획 요약(Community Summaries) ──
// 소비 표면(답변엔진)의 척추. 커밋 시 변경 구획만 재요약(전량 재계산 금지, stale 게이팅).
export const summaries = pgTable(
  'summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ontologyId: uuid('ontology_id')
      .notNull()
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    partitionId: uuid('partition_id')
      .notNull()
      .references(() => partitions.id, { onDelete: 'cascade' }),
    commitId: uuid('commit_id'),
    summary: text('summary').notNull().default(''),
    embedding: vector('embedding', { dimensions: 1536 }),
    stale: boolean('stale').notNull().default(true),
    criticHealth: real('critic_health'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_summaries_ontology').on(t.ontologyId),
    unique('uq_summary_partition').on(t.partitionId),
  ],
);

export const summariesRelations = relations(summaries, ({ one }) => ({
  ontology: one(ontologies, {
    fields: [summaries.ontologyId],
    references: [ontologies.id],
  }),
  partition: one(partitions, {
    fields: [summaries.partitionId],
    references: [partitions.id],
  }),
}));

// ─── PRD-PF-I: 자동화 · 트리거 · 상태 라이프사이클 ──
// 다이나믹 레이어의 실체 = (b)상태머신 + (c)이벤트-트리거. 완전자동 금지(제안까지, 확정은 사람).
export const objectStateDefs = pgTable(
  'object_state_defs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ontologyId: uuid('ontology_id')
      .notNull()
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default(''),
    states: jsonb('states').notNull().default([]),
    initialState: text('initial_state').notNull(),
    transitions: jsonb('transitions').notNull().default([]),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_state_defs_ontology').on(t.ontologyId),
    unique('uq_state_def_class').on(t.classId),
  ],
);

export const instanceStateLog = pgTable(
  'instance_state_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ontologyId: uuid('ontology_id')
      .notNull()
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => instances.id, { onDelete: 'cascade' }),
    fromState: text('from_state'),
    toState: text('to_state').notNull(),
    actor: text('actor').notNull().default('user'),
    // 상호 FK(automation_runs) 는 DB 레벨에만(ALTER). 스키마는 plain uuid 로 순환 회피.
    triggeredByRunId: uuid('triggered_by_run_id'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('idx_state_log_instance').on(t.instanceId, t.createdAt)],
);

export const triggers = pgTable(
  'triggers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ontologyId: uuid('ontology_id')
      .notNull()
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    eventType: text('event_type').notNull(),
    eventConfig: jsonb('event_config').notNull().default({}),
    targetFunctionId: uuid('target_function_id').references(() => functions.id, {
      onDelete: 'set null',
    }),
    scope: jsonb('scope').notNull().default({}),
    rateLimit: jsonb('rate_limit').notNull().default({}),
    enabled: boolean('enabled').notNull().default(true),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_triggers_ontology').on(t.ontologyId),
    check(
      'chk_trigger_event',
      sql`${t.eventType} IN ('dataset_updated','schedule','instance_created','instance_updated','manual')`,
    ),
  ],
);

export const automationRuns = pgTable(
  'automation_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ontologyId: uuid('ontology_id')
      .notNull()
      .references(() => ontologies.id, { onDelete: 'cascade' }),
    triggerId: uuid('trigger_id').references(() => triggers.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('queued'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    inputSnapshot: jsonb('input_snapshot').notNull().default({}),
    output: jsonb('output').notNull().default({}),
    actionProposalId: uuid('action_proposal_id').references(() => actionItems.id, {
      onDelete: 'set null',
    }),
    stateTransitionId: uuid('state_transition_id').references(
      () => instanceStateLog.id,
      { onDelete: 'set null' },
    ),
    error: text('error'),
    actor: text('actor').notNull().default('system'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_runs_trigger').on(t.triggerId, t.createdAt),
    index('idx_runs_ontology').on(t.ontologyId, t.createdAt),
    check(
      'chk_run_status',
      sql`${t.status} IN ('queued','running','succeeded','failed','skipped_rate_limit','skipped_disabled')`,
    ),
    check('chk_run_actor', sql`${t.actor} IN ('system','user')`),
  ],
);

export const triggersRelations = relations(triggers, ({ one, many }) => ({
  ontology: one(ontologies, {
    fields: [triggers.ontologyId],
    references: [ontologies.id],
  }),
  targetFunction: one(functions, {
    fields: [triggers.targetFunctionId],
    references: [functions.id],
  }),
  runs: many(automationRuns),
}));

export const automationRunsRelations = relations(automationRuns, ({ one }) => ({
  trigger: one(triggers, {
    fields: [automationRuns.triggerId],
    references: [triggers.id],
  }),
  ontology: one(ontologies, {
    fields: [automationRuns.ontologyId],
    references: [ontologies.id],
  }),
}));

export const objectStateDefsRelations = relations(objectStateDefs, ({ one }) => ({
  ontology: one(ontologies, {
    fields: [objectStateDefs.ontologyId],
    references: [ontologies.id],
  }),
  class: one(classes, {
    fields: [objectStateDefs.classId],
    references: [classes.id],
  }),
}));

export const instanceStateLogRelations = relations(instanceStateLog, ({ one }) => ({
  instance: one(instances, {
    fields: [instanceStateLog.instanceId],
    references: [instances.id],
  }),
}));
