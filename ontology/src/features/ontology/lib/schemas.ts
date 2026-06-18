import { z } from 'zod';
import { DEFAULT_PARTITION_ID } from './types';

// ─── Partitions (PRD-B B-1) ────────────────────────────────
export const createPartitionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional().default(''),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .default('#2563eb'),
});

export const updatePartitionSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export type CreatePartitionInput = z.infer<typeof createPartitionSchema>;
export type UpdatePartitionInput = z.infer<typeof updatePartitionSchema>;

// ─── Classes ───────────────────────────────────────────────
export const createClassSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  parentId: z.string().uuid().nullable().optional(),
  // PRD-B B-1: 소속 구획 (미지정 시 기본 구획).
  partitionId: z.string().uuid().optional().default(DEFAULT_PARTITION_ID),
  description: z.string().optional().default(''),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .default('#7c3aed'),
  positionX: z.number().optional().default(0),
  positionY: z.number().optional().default(0),
  // A-4 provenance (nullable).
  sourceType: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  evidence: z.string().nullable().optional(),
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
    // PRD-B B-1: 구획 간 연결(bridge) 여부 (클라이언트가 계산해 전달).
    isBridge: z.boolean().optional().default(false),
    // A-4 provenance (nullable).
    sourceType: z.string().nullable().optional(),
    confidence: z.number().nullable().optional(),
    evidence: z.string().nullable().optional(),
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

// ─── Multi-stage Parse (A-1) ─────────────────────────────
// Stage 1 extracts entities (points), Stage 2 extracts grounded relations
// (lines). Both carry evidence spans; relations also carry a confidence score.
// Document title/subject must NOT be forced as a hub — islands are allowed.

// A property carried by an entity. For instances, `value` is the concrete value
// (e.g. partNumber = KC0330655). For classes the array is empty (definitions are
// derived from instances during mapping).
export const parsedEntityPropertySchema = z.object({
  name: z.string().min(1),
  value: z.string(),
  dataType: dataTypeEnum,
});

export const parsedEntitySchema = z.object({
  name: z.string().min(1),
  // Category/class of the entity. Reuses an existing class name when one fits,
  // otherwise proposes a new type. NOT the document title.
  type: z.string(),
  // A-1.1: is this a category (class) or a concrete object (instance)?
  nodeKind: z.enum(['class', 'instance']),
  // For instances: the owning class name (matches a class entity name or an
  // existing class). null for classes.
  parentType: z.string().nullable(),
  // Short verbatim span from the source text supporting this entity.
  evidence: z.string(),
  // Property values (instances). Empty for classes.
  properties: z.array(parsedEntityPropertySchema),
});

export const parsedRelationSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  // Relation/verb name (causal, compositional, temporal, measurement, etc.).
  type: z.string().min(1),
  // Verbatim span grounding this relation. Empty grounding => no relation.
  evidence: z.string(),
  confidence: z.number().min(0).max(1),
});

export const parseStage1ResponseSchema = z.object({
  entities: z.array(parsedEntitySchema),
});

export const parseStage2ResponseSchema = z.object({
  relations: z.array(parsedRelationSchema),
});

export const parseResponseSchema = z.object({
  entities: z.array(parsedEntitySchema),
  relations: z.array(parsedRelationSchema),
});

export type ParsedEntity = z.infer<typeof parsedEntitySchema>;
export type ParsedRelation = z.infer<typeof parsedRelationSchema>;
export type ParseResponse = z.infer<typeof parseResponseSchema>;

export const parseRequestSchema = z.object({
  text: z.string().min(1),
  existingClasses: z.array(z.string()).optional(),
  existingRelationTypes: z.array(z.string()).optional(),
  // Enriched schema context (class hierarchy + types + key relations), built by
  // buildSchemaContext on the client. Used by A-2 for node reuse judgement.
  existingSchema: z.string().optional(),
});

export type ParseRequestInput = z.infer<typeof parseRequestSchema>;

// ─── Enrichment: Gap Detection (A-3) ─────────────────────
const gapKindEnum = z.enum([
  'no_definition',
  'isolated',
  'missing_property',
  'missing_axiom',
  'undefined_concept',
  'low_confidence',
]);
const gapSeverityEnum = z.enum(['high', 'med', 'low']);

export const gapSchema = z.object({
  targetName: z.string().min(1),
  kind: gapKindEnum,
  reason: z.string(),
  severity: gapSeverityEnum,
});

// LLM emits only the qualitative kinds; the rest come from the deterministic pass.
export const llmGapResponseSchema = z.object({
  gaps: z.array(
    z.object({
      targetName: z.string().min(1),
      kind: z.enum(['missing_axiom', 'low_confidence', 'no_definition']),
      reason: z.string(),
      severity: gapSeverityEnum,
    }),
  ),
});

export const detectRequestSchema = z.object({
  subgraph: z.object({
    nodes: z.array(
      z.object({
        name: z.string().min(1),
        type: z.string().nullable().optional(),
        description: z.string().optional(),
        evidence: z.string().optional(),
        propertyCount: z.number().int().optional(),
      }),
    ),
    relations: z.array(
      z.object({
        source: z.string().min(1),
        target: z.string().min(1),
        type: z.string(),
        confidence: z.number().optional(),
      }),
    ),
  }),
});

export type DetectRequestInput = z.infer<typeof detectRequestSchema>;

// ─── Enrichment: Sourcing (A-4) ──────────────────────────
const sourceTypeEnum = z.enum(['existing_graph', 'session_doc', 'web', 'inferred']);

// What the LLM may emit (no web/existing_graph — those are attached server-side
// with verified provenance). needsReview is decided by the route, not the model.
export const sourceLlmResponseSchema = z.object({
  proposals: z.array(
    z.object({
      value: z.string(),
      sourceType: z.enum(['session_doc', 'inferred']),
      evidence: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export const sourceRequestSchema = z.object({
  gap: gapSchema,
  // Session context (other docs in the same import bundle, etc.).
  context: z.string().optional(),
  useWeb: z.boolean().optional().default(false),
});

export type SourceRequestInput = z.infer<typeof sourceRequestSchema>;
export { sourceTypeEnum };

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

// OpenAI structured outputs (strict) reject `oneOf`, so a discriminated union
// can't be sent on the wire. This is a FLAT schema (all fields nullable-required)
// that the /api/llm/assist route maps back into OntologyAction.
export const assistWireActionSchema = z.object({
  op: z.enum([
    'add_class',
    'add_property',
    'add_instance',
    'add_relation_type',
    'add_edge',
    'update_class',
  ]),
  label: z.string(),
  name: z.string().nullable(),
  className: z.string().nullable(),
  parentName: z.string().nullable(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  dataType: z.enum(['string', 'integer', 'float', 'boolean', 'date', 'enum']).nullable(),
  enumValues: z.array(z.string()).nullable(),
  isRequired: z.boolean().nullable(),
  sourceClassName: z.string().nullable(),
  targetClassName: z.string().nullable(),
  relationTypeName: z.string().nullable(),
  sourceName: z.string().nullable(),
  targetName: z.string().nullable(),
});

export type AssistWireAction = z.infer<typeof assistWireActionSchema>;

export const assistWireResponseSchema = z.object({
  reply: z.string(),
  actions: z.array(assistWireActionSchema),
});
