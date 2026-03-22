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
    constraintRule: z.record(z.unknown()).nullable().optional(),
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
  constraintRule: z.record(z.unknown()).nullable().optional(),
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
  ruleLogic: z.record(z.unknown()).optional().default({}),
  severity: severityEnum.optional().default('warning'),
  classIds: z.array(z.string().uuid()).optional().default([]),
});

export type CreateAxiomInput = z.infer<typeof createAxiomSchema>;

export const updateAxiomSchema = z.object({
  description: z.string().min(1).optional(),
  ruleLogic: z.record(z.unknown()).optional(),
  severity: severityEnum.optional(),
  classIds: z.array(z.string().uuid()).optional(),
});

export type UpdateAxiomInput = z.infer<typeof updateAxiomSchema>;

// ─── Commits ───────────────────────────────────────────────
const operationEnum = z.enum(['ADD', 'MOD', 'DEL']);

export const createCommitSchema = z.object({
  message: z.string().optional().default(''),
  details: z.array(
    z.object({
      operation: operationEnum,
      targetTable: z.string().min(1),
      targetId: z.string().uuid(),
      beforeSnapshot: z.record(z.unknown()).nullable().optional(),
      afterSnapshot: z.record(z.unknown()).nullable().optional(),
    }),
  ),
});

export type CreateCommitInput = z.infer<typeof createCommitSchema>;
