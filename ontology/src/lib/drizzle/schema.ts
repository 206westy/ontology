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
