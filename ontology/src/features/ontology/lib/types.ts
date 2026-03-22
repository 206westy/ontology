export type DataType = 'string' | 'integer' | 'float' | 'boolean' | 'date' | 'enum';

export type ChangeOperation = 'ADD' | 'MOD' | 'DEL';

export type NodeColorKey = 'root' | 'mid' | 'leaf' | 'instance' | 'person' | 'place' | 'event';

export interface OntologyClass {
  id: string;
  parentId: string | null;
  name: string;
  description: string;
  color: string;
  positionX: number;
  positionY: number;
  createdAt: string;
  updatedAt: string;
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
