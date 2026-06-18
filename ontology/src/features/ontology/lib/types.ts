export type DataType = 'string' | 'integer' | 'float' | 'boolean' | 'date' | 'enum';

export type ChangeOperation = 'ADD' | 'MOD' | 'DEL';

export type NodeColorKey = 'root' | 'mid' | 'leaf' | 'instance' | 'person' | 'place' | 'event' | 'concept' | 'process' | 'artifact';

// PRD-B B-1: 구획(Named Graph). 마이그레이션이 만든 기본 구획 고정 UUID.
export const DEFAULT_PARTITION_ID = '00000000-0000-0000-0000-000000000001';

export interface Partition {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
}

export interface OntologyClass {
  id: string;
  parentId: string | null;
  partitionId: string;
  name: string;
  description: string;
  color: string;
  positionX: number;
  positionY: number;
  createdAt: string;
  updatedAt: string;
  // A-4 provenance (optional).
  sourceType?: string | null;
  confidence?: number | null;
  evidence?: string | null;
}

export interface OntologyProperty {
  id: string;
  classId: string;
  name: string;
  dataType: DataType;
  isRequired: boolean;
  enumValues: string[] | null;
  constraintRule: Record<string, unknown> | null;
  sortOrder: number;
}

export interface OntologyInstance {
  id: string;
  classId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstanceValue {
  id: string;
  instanceId: string;
  propertyId: string;
  value: string;
}

export interface RelationType {
  id: string;
  name: string;
  description: string;
  sourceClassId: string;
  targetClassId: string;
  createdAt: string;
}

export interface OntologyEdge {
  id: string;
  relationTypeId: string;
  sourceId: string;
  targetId: string;
  sourceKind: 'class' | 'instance';
  targetKind: 'class' | 'instance';
  createdAt: string;
  // PRD-B B-1: 구획 간 연결(bridge) 여부.
  isBridge?: boolean;
  // A-4 provenance (optional).
  sourceType?: string | null;
  confidence?: number | null;
  evidence?: string | null;
}

export interface OntologyAxiom {
  id: string;
  description: string;
  ruleLogic: Record<string, unknown> | null;
  severity: string;
  classIds: string[];
  createdAt: string;
}

export interface Commit {
  id: string;
  message: string;
  pushedToNeo4j: boolean;
  pushedAt: string | null;
  isAutoSave: boolean;
  createdAt: string;
}

export interface CommitDetail {
  id: string;
  commitId: string;
  operation: ChangeOperation;
  targetTable: string;
  targetId: string;
  beforeSnapshot: Record<string, unknown> | null;
  afterSnapshot: Record<string, unknown> | null;
}

export interface Change {
  id: string;
  operation: ChangeOperation;
  targetTable: string;
  targetId: string;
  targetName: string;
  timestamp: string;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
}

export interface PopoverState {
  type: 'newNode' | 'relation' | 'hierarchy';
  position: { x: number; y: number };
  sourceId?: string;
  targetId?: string;
  initialText?: string;
}

export interface TreeNode {
  id: string;
  name: string;
  color: string;
  type: 'class' | 'instance';
  parentId: string | null;
  childCount: number;
  instanceCount: number;
  children: TreeNode[];
  expanded: boolean;
}

// v3: Validation
export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  ruleCode: string;
  message: string;
  targetTable: string;
  targetId: string;
  constraintId?: string;
}

export interface ValidationResult {
  runId: string;
  summary: { total: number; errors: number; warnings: number; infos: number };
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  infos: ValidationIssue[];
}

// v3: Constraint
export type ConstraintType = 'cardinality' | 'disjoint' | 'domain_range' | 'property_value';

export interface OntologyConstraint {
  id: string;
  constraintType: ConstraintType;
  description: string;
  sourceClassId: string | null;
  targetClassId: string | null;
  relationTypeId: string | null;
  propertyId: string | null;
  config: Record<string, unknown>;
  severity: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
