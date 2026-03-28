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
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─── classes ───────────────────────────────────────────────
export const classes = pgTable(
  'classes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id').references((): any => classes.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    description: text('description').default(''),
    color: text('color').notNull().default('#7c3aed'),
    namespace: text('namespace'),
    positionX: real('position_x').notNull().default(0),
    positionY: real('position_y').notNull().default(0),
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
    check('chk_color_hex', sql`${t.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

export const classesRelations = relations(classes, ({ one, many }) => ({
  parent: one(classes, {
    fields: [classes.parentId],
    references: [classes.id],
    relationName: 'classHierarchy',
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
export const relationTypes = pgTable('relation_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  description: text('description').default(''),
  sourceClassId: uuid('source_class_id').references(() => classes.id, {
    onDelete: 'set null',
  }),
  targetClassId: uuid('target_class_id').references(() => classes.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // v3: 관계별 카디널리티 (NULL = 제약 없음)
    minCardinality: integer('min_cardinality'),
    maxCardinality: integer('max_cardinality'),
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

// ─── commits ───────────────────────────────────────────────
export const commits = pgTable('commits', {
  id: uuid('id').primaryKey().defaultRandom(),
  message: text('message').default(''),
  pushedToNeo4j: boolean('pushed_to_neo4j').notNull().default(false),
  pushedAt: timestamp('pushed_at', { withTimezone: true }),
  isAutoSave: boolean('is_auto_save').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const commitsRelations = relations(commits, ({ many }) => ({
  details: many(commitDetails),
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
