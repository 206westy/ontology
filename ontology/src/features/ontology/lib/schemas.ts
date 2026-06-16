import { z } from 'zod';

// ─── Classes ───────────────────────────────────────────────
export const createClassSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().optional().default(''),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .default('#7c3aed'),
  positionX: z.number().optional().default(0),
  positionY: z.number().optional().default(0),
});

export const updateClassSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;

// ─── Properties ────────────────────────────────────────────
const dataTypeEnum = z.enum([
  'string',
  'integer',
  'float',
  'boolean',
  'date',
  'enum',
]);

export const createPropertySchema = z
  .object({
    id: z.string().uuid().optional(),
    classId: z.string().uuid(),
    name: z.string().min(1),
    dataType: dataTypeEnum.optional().default('string'),
    isRequired: z.boolean().optional().default(false),
    enumValues: z.array(z.string()).nullable().optional(),
    constraintRule: z.record(z.string(), z.unknown()).nullable().optional(),
    sortOrder: z.number().int().optional().default(0),
  })
  .refine(
    (d) => d.dataType !== 'enum' || (d.enumValues && d.enumValues.length > 0),
    { message: 'enum type requires at least one enum value' },
  );

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = z.object({
  name: z.string().min(1).optional(),
  dataType: dataTypeEnum.optional(),
  isRequired: z.boolean().optional(),
  enumValues: z.array(z.string()).nullable().optional(),
  constraintRule: z.record(z.string(), z.unknown()).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

// ─── Instances ─────────────────────────────────────────────
export const createInstanceSchema = z.object({
  id: z.string().uuid().optional(),
  classId: z.string().uuid(),
  name: z.string().min(1),
  values: z
    .array(
      z.object({
        propertyId: z.string().uuid(),
        value: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

export type CreateInstanceInput = z.infer<typeof createInstanceSchema>;

export const updateInstanceSchema = z.object({
  name: z.string().min(1).optional(),
  classId: z.string().uuid().optional(),
});

export type UpdateInstanceInput = z.infer<typeof updateInstanceSchema>;

// ─── Instance Values ───────────────────────────────────────
export const createInstanceValueSchema = z.object({
  instanceId: z.string().uuid(),
  propertyId: z.string().uuid(),
  value: z.string().nullable().optional(),
});

export type CreateInstanceValueInput = z.infer<
  typeof createInstanceValueSchema
>;

// ─── Relation Types ────────────────────────────────────────
export const createRelationTypeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional().default(''),
  sourceClassId: z.string().uuid().nullable().optional(),
  targetClassId: z.string().uuid().nullable().optional(),
});

export type CreateRelationTypeInput = z.infer<
  typeof createRelationTypeSchema
>;

export const updateRelationTypeSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  sourceClassId: z.string().uuid().nullable().optional(),
  targetClassId: z.string().uuid().nullable().optional(),
});

export type UpdateRelationTypeInput = z.infer<typeof updateRelationTypeSchema>;

// ─── Edges ─────────────────────────────────────────────────
const kindEnum = z.enum(['class', 'instance']);

export const createEdgeSchema = z
  .object({
    id: z.string().uuid().optional(),
    relationTypeId: z.string().uuid(),
    sourceId: z.string().uuid(),
    targetId: z.string().uuid(),
    sourceKind: kindEnum,
    targetKind: kindEnum,
  })
  .refine((d) => d.sourceId !== d.targetId, {
    message: 'source and target must differ',
  });

export type CreateEdgeInput = z.infer<typeof createEdgeSchema>;

// ─── Axioms ────────────────────────────────────────────────
const severityEnum = z.enum(['info', 'warning', 'error']);

export const createAxiomSchema = z.object({
  id: z.string().uuid().optional(),
  description: z.string().min(1),
  ruleLogic: z.record(z.string(), z.unknown()).optional().default({}),
  severity: severityEnum.optional().default('warning'),
  classIds: z.array(z.string().uuid()).optional().default([]),
});

export type CreateAxiomInput = z.infer<typeof createAxiomSchema>;

export const updateAxiomSchema = z.object({
  description: z.string().min(1).optional(),
  ruleLogic: z.record(z.string(), z.unknown()).optional(),
  severity: severityEnum.optional(),
  classIds: z.array(z.string().uuid()).optional(),
});

export type UpdateAxiomInput = z.infer<typeof updateAxiomSchema>;

// ─── Commits ───────────────────────────────────────────────
const operationEnum = z.enum(['ADD', 'MOD', 'DEL']);

export const createCommitSchema = z.object({
  message: z.string().optional().default(''),
  isAutoSave: z.boolean().optional().default(false),
  details: z.array(
    z.object({
      operation: operationEnum,
      targetTable: z.string().min(1),
      targetId: z.string().uuid(),
      beforeSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
      afterSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
  ),
});

export type CreateCommitInput = z.input<typeof createCommitSchema>;

// ─── Constraints (v3) ─────────────────────────────────────
const constraintTypeEnum = z.enum([
  'cardinality',
  'disjoint',
  'domain_range',
  'property_value',
]);

export const createConstraintSchema = z.object({
  id: z.string().uuid().optional(),
  constraintType: constraintTypeEnum,
  description: z.string().optional().default(''),
  sourceClassId: z.string().uuid().nullable().optional(),
  targetClassId: z.string().uuid().nullable().optional(),
  relationTypeId: z.string().uuid().nullable().optional(),
  propertyId: z.string().uuid().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  severity: severityEnum.optional().default('error'),
  isActive: z.boolean().optional().default(true),
});

export type CreateConstraintInput = z.infer<typeof createConstraintSchema>;

export const updateConstraintSchema = z.object({
  constraintType: constraintTypeEnum.optional(),
  description: z.string().optional(),
  sourceClassId: z.string().uuid().nullable().optional(),
  targetClassId: z.string().uuid().nullable().optional(),
  relationTypeId: z.string().uuid().nullable().optional(),
  propertyId: z.string().uuid().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  severity: severityEnum.optional(),
  isActive: z.boolean().optional(),
});

export type UpdateConstraintInput = z.infer<typeof updateConstraintSchema>;

// ─── Batch Operations (v3) ────────────────────────────────
const batchEntityType = z.enum([
  'class',
  'instance',
  'property',
  'edge',
  'relation_type',
  'axiom',
  'instance_value',
]);

const batchAction = z.enum(['create', 'update', 'delete']);

export const batchOperationSchema = z.object({
  type: batchEntityType,
  action: batchAction,
  id: z.string().uuid().optional(),
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

export const batchRequestSchema = z.object({
  operations: z.array(batchOperationSchema).min(1).max(200),
});

export type BatchOperation = z.infer<typeof batchOperationSchema>;
export type BatchRequestInput = z.infer<typeof batchRequestSchema>;

// ─── Validate (v3) ────────────────────────────────────────
export const validateRequestSchema = z.object({
  rules: z
    .array(
      z.enum([
        'cyclic_isa',
        'required_properties',
        'cardinality',
        'orphan_nodes',
        'similar_names',
      ]),
    )
    .optional(),
});

export type ValidateRequestInput = z.infer<typeof validateRequestSchema>;

// ─── LLM Chat (v3) ───────────────────────────────────────
export const llmChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    }),
  ),
  context: z
    .object({
      selectedNodeIds: z.array(z.string()).optional(),
      selectedNodeType: z.string().optional(),
      ontologySummary: z.string().optional(),
    })
    .optional(),
});

export type LlmChatRequestInput = z.infer<typeof llmChatRequestSchema>;

// ─── Text2Cypher (v3) ────────────────────────────────────
export const text2CypherRequestSchema = z.object({
  question: z.string().min(1),
  executeQuery: z.boolean().optional().default(false),
  maxRetries: z.number().int().min(0).max(3).optional().default(1),
});

export type Text2CypherRequestInput = z.infer<typeof text2CypherRequestSchema>;

// ─── Import / Export (v3) ─────────────────────────────────
export const importRequestSchema = z.object({
  version: z.string().default('1.0'),
  ontology: z.object({
    classes: z.array(z.record(z.string(), z.unknown())).default([]),
    properties: z.array(z.record(z.string(), z.unknown())).default([]),
    instances: z.array(z.record(z.string(), z.unknown())).default([]),
    instanceValues: z.array(z.record(z.string(), z.unknown())).default([]),
    relationTypes: z.array(z.record(z.string(), z.unknown())).default([]),
    edges: z.array(z.record(z.string(), z.unknown())).default([]),
    axioms: z.array(z.record(z.string(), z.unknown())).default([]),
    axiomClasses: z.array(z.record(z.string(), z.unknown())).default([]),
    constraints: z.array(z.record(z.string(), z.unknown())).default([]),
  }),
  strategy: z.enum(['replace', 'merge']).default('replace'),
});

export type ImportRequestInput = z.infer<typeof importRequestSchema>;

// ─── AI Assistant Structured Actions (P0-1) ──────────────────
// Name-based payloads — resolved to ids inside the store's applyAssistantActions.
export const ontologyActionSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_class'),
    label: z.string(),
    payload: z.object({
      name: z.string().min(1),
      parentName: z.string().optional(),
      description: z.string().optional(),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
    }),
  }),
  z.object({
    op: z.literal('add_property'),
    label: z.string(),
    payload: z.object({
      className: z.string().min(1),
      name: z.string().min(1),
      dataType: dataTypeEnum,
      enumValues: z.array(z.string()).optional(),
      isRequired: z.boolean().optional(),
    }),
  }),
  z.object({
    op: z.literal('add_instance'),
    label: z.string(),
    payload: z.object({
      className: z.string().min(1),
      name: z.string().min(1),
    }),
  }),
  z.object({
    op: z.literal('add_relation_type'),
    label: z.string(),
    payload: z.object({
      name: z.string().min(1),
      sourceClassName: z.string().optional(),
      targetClassName: z.string().optional(),
    }),
  }),
  z.object({
    op: z.literal('add_edge'),
    label: z.string(),
    payload: z.object({
      relationTypeName: z.string().min(1),
      sourceName: z.string().min(1),
      targetName: z.string().min(1),
    }),
  }),
  z.object({
    op: z.literal('update_class'),
    label: z.string(),
    payload: z.object({
      className: z.string().min(1),
      description: z.string().optional(),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
    }),
  }),
]);

export type OntologyAction = z.infer<typeof ontologyActionSchema>;

export const assistantActionResponseSchema = z.object({
  reply: z.string(),
  actions: z.array(ontologyActionSchema),
});

export type AssistantActionResponse = z.infer<typeof assistantActionResponseSchema>;

export const assistRequestSchema = z.object({
  message: z.string().min(1),
  selectedNodeId: z.string().optional(),
  ontologySummary: z.string().optional().default(''),
});

export type AssistRequestInput = z.infer<typeof assistRequestSchema>;
