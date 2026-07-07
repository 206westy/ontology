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
  // PRD-E P1-1: RAG 문맥용 설명.
  description: string;
  createdAt: string;
  updatedAt: string;
}

// PRD-E P1-1: 다형성 출처(어트리뷰션). 6요소 횡단 1급 요소.
export type AttributionSourceType =
  | 'document'
  | 'sap'
  | 'user'
  | 'web'
  | 'inferred';

export type AttributionTargetTable =
  | 'classes'
  | 'instances'
  | 'properties'
  | 'edges'
  | 'relation_types'
  | 'axioms'
  | 'constraints';

export interface Attribution {
  id: string;
  targetTable: AttributionTargetTable;
  targetId: string;
  sourceType: AttributionSourceType;
  sourceRef: string | null;
  evidence: string | null;
  confidence: number | null;
  createdAt: string;
}

export interface InstanceValue {
  id: string;
  instanceId: string;
  propertyId: string;
  value: string;
}

// PR1 (목표①): 관계의 액션 지향 분류. parsedRelationSchema 의 enum 과 동일.
export type RelationCategory =
  | 'structural'
  | 'causal'
  | 'diagnostic'
  | 'procedural'
  | 'descriptive';

export interface RelationType {
  id: string;
  name: string;
  description: string;
  // PR1 (목표①): 추출 시점에 부여되는 액션 지향 분류. 기존 데이터는 'descriptive' 백필.
  category: RelationCategory;
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
  // PRD-F P4-1: category 판정 확신도. 저신뢰는 traversal 비우선(값 자체는 보존).
  categoryConfidence?: number | null;
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
  // PRD-J M1: null = main 커밋. 작성자는 서버 세션에서 주입(과거 커밋은 null 가능).
  branchId?: string | null;
  authorId?: string | null;
  authorEmail?: string | null;
  parentCommitId?: string | null;
  createdAt: string;
}

// PRD-J M1: 온톨로지 브랜치 (베이스 스냅샷 + 커밋 체인)
export interface OntologyBranch {
  id: string;
  name: string;
  description: string;
  authorId: string | null;
  authorEmail: string | null;
  baseCommitId: string | null;
  status: 'active' | 'merged' | 'abandoned';
  mergedAt: string | null;
  mergedBy: string | null;
  mergeCommitId: string | null;
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
