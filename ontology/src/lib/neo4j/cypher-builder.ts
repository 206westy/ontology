import { z } from 'zod';

// ─── Types ──────────────────────────────────────────────────

export interface CypherStatement {
  query: string;
  params: Record<string, unknown>;
  description: string;
}

const operationEnum = z.enum(['ADD', 'MOD', 'DEL']);
const targetTableEnum = z.enum([
  'classes',
  'instances',
  'edges',
  'properties',
  'relation_types',
  'axioms',
  'axiom_classes',
  'instance_values',
]);

export const commitDetailSchema = z.object({
  operation: operationEnum,
  targetTable: targetTableEnum,
  targetId: z.string().uuid(),
  beforeSnapshot: z.record(z.unknown()).nullable().optional(),
  afterSnapshot: z.record(z.unknown()).nullable().optional(),
});

export type CommitDetail = z.infer<typeof commitDetailSchema>;

// ─── Cypher Generators by Table ─────────────────────────────

function classAdd(detail: CommitDetail): CypherStatement {
  const snap = detail.afterSnapshot as Record<string, unknown>;
  return {
    query: `CREATE (n:Class {id: $id, name: $name, description: $description, color: $color})`,
    params: {
      id: detail.targetId,
      name: snap.name ?? '',
      description: snap.description ?? '',
      color: snap.color ?? '#7c3aed',
    },
    description: `클래스 "${snap.name}" 생성`,
  };
}

function classMod(detail: CommitDetail): CypherStatement {
  const snap = detail.afterSnapshot as Record<string, unknown>;
  return {
    query: `MATCH (n:Class {id: $id}) SET n.name = $name, n.description = $description, n.color = $color`,
    params: {
      id: detail.targetId,
      name: snap.name ?? '',
      description: snap.description ?? '',
      color: snap.color ?? '#7c3aed',
    },
    description: `클래스 "${snap.name}" 수정`,
  };
}

function classDel(detail: CommitDetail): CypherStatement {
  const snap = (detail.beforeSnapshot ?? detail.afterSnapshot) as Record<string, unknown> | undefined;
  return {
    query: `MATCH (n:Class {id: $id}) DETACH DELETE n`,
    params: { id: detail.targetId },
    description: `클래스 "${snap?.name ?? detail.targetId}" 삭제`,
  };
}

function classIsARelation(detail: CommitDetail): CypherStatement[] {
  const snap = detail.afterSnapshot as Record<string, unknown>;
  if (!snap.parentId) return [];
  return [
    {
      query: `MATCH (child:Class {id: $childId}), (parent:Class {id: $parentId}) MERGE (child)-[:IS_A]->(parent)`,
      params: { childId: detail.targetId, parentId: snap.parentId },
      description: `클래스 "${snap.name}" → 상위 클래스 IS_A 관계 설정`,
    },
  ];
}

function instanceAdd(detail: CommitDetail): CypherStatement {
  const snap = detail.afterSnapshot as Record<string, unknown>;
  return {
    query: `CREATE (n:Instance {id: $id, name: $name, classId: $classId})`,
    params: {
      id: detail.targetId,
      name: snap.name ?? '',
      classId: snap.classId ?? '',
    },
    description: `인스턴스 "${snap.name}" 생성`,
  };
}

function instanceClassEdge(detail: CommitDetail): CypherStatement[] {
  const snap = detail.afterSnapshot as Record<string, unknown>;
  if (!snap.classId) return [];
  return [
    {
      query: `MATCH (i:Instance {id: $instanceId}), (c:Class {id: $classId}) MERGE (i)-[:INSTANCE_OF]->(c)`,
      params: { instanceId: detail.targetId, classId: snap.classId },
      description: `인스턴스 "${snap.name}" → 클래스 INSTANCE_OF 관계 설정`,
    },
  ];
}

function instanceMod(detail: CommitDetail): CypherStatement {
  const snap = detail.afterSnapshot as Record<string, unknown>;
  return {
    query: `MATCH (n:Instance {id: $id}) SET n.name = $name, n.classId = $classId`,
    params: {
      id: detail.targetId,
      name: snap.name ?? '',
      classId: snap.classId ?? '',
    },
    description: `인스턴스 "${snap.name}" 수정`,
  };
}

function instanceDel(detail: CommitDetail): CypherStatement {
  const snap = (detail.beforeSnapshot ?? detail.afterSnapshot) as Record<string, unknown> | undefined;
  return {
    query: `MATCH (n:Instance {id: $id}) DETACH DELETE n`,
    params: { id: detail.targetId },
    description: `인스턴스 "${snap?.name ?? detail.targetId}" 삭제`,
  };
}

function edgeAdd(detail: CommitDetail): CypherStatement {
  const snap = detail.afterSnapshot as Record<string, unknown>;
  const relName = (snap.relationTypeName as string) ?? 'RELATED_TO';
  const safeRelName = relName.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
  return {
    query: `MATCH (a {id: $sourceId}), (b {id: $targetId}) CREATE (a)-[:${safeRelName} {id: $id, relationTypeId: $relationTypeId}]->(b)`,
    params: {
      id: detail.targetId,
      sourceId: snap.sourceId ?? '',
      targetId: snap.targetId ?? '',
      relationTypeId: snap.relationTypeId ?? '',
    },
    description: `관계 "${relName}" 엣지 생성`,
  };
}

function edgeDel(detail: CommitDetail): CypherStatement {
  return {
    query: `MATCH ()-[r {id: $id}]->() DELETE r`,
    params: { id: detail.targetId },
    description: `엣지 "${detail.targetId}" 삭제`,
  };
}

function propertyAdd(detail: CommitDetail): CypherStatement {
  const snap = detail.afterSnapshot as Record<string, unknown>;
  return {
    query: `MATCH (c:Class {id: $classId}) SET c.\`${String(snap.name)}\` = $defaultDesc`,
    params: {
      classId: snap.classId ?? '',
      defaultDesc: `[${snap.dataType ?? 'string'}]${snap.isRequired ? ' required' : ''}`,
    },
    description: `프로퍼티 "${snap.name}" → 클래스 노드에 속성 추가`,
  };
}

function propertyDel(detail: CommitDetail): CypherStatement {
  const snap = (detail.beforeSnapshot ?? detail.afterSnapshot) as Record<string, unknown> | undefined;
  return {
    query: `MATCH (c:Class {id: $classId}) REMOVE c.\`${String(snap?.name ?? 'unknown')}\``,
    params: { classId: snap?.classId ?? '' },
    description: `프로퍼티 "${snap?.name}" 제거`,
  };
}

function relationTypeAdd(detail: CommitDetail): CypherStatement {
  const snap = detail.afterSnapshot as Record<string, unknown>;
  return {
    query: `CREATE (rt:RelationType {id: $id, name: $name, description: $description})`,
    params: {
      id: detail.targetId,
      name: snap.name ?? '',
      description: snap.description ?? '',
    },
    description: `관계 타입 "${snap.name}" 생성`,
  };
}

function relationTypeDel(detail: CommitDetail): CypherStatement {
  const snap = (detail.beforeSnapshot ?? detail.afterSnapshot) as Record<string, unknown> | undefined;
  return {
    query: `MATCH (rt:RelationType {id: $id}) DETACH DELETE rt`,
    params: { id: detail.targetId },
    description: `관계 타입 "${snap?.name ?? detail.targetId}" 삭제`,
  };
}

// ─── Main Builder ───────────────────────────────────────────

export function buildCypherStatements(details: CommitDetail[]): CypherStatement[] {
  const statements: CypherStatement[] = [];

  // Sort: ADD first, then MOD, then DEL (ensures nodes exist before edges)
  const sorted = [...details].sort((a, b) => {
    const order = { ADD: 0, MOD: 1, DEL: 2 };
    return order[a.operation] - order[b.operation];
  });

  // Within ADD, process classes before instances before edges
  const tableOrder: Record<string, number> = {
    classes: 0,
    relation_types: 1,
    properties: 2,
    instances: 3,
    instance_values: 4,
    edges: 5,
    axioms: 6,
    axiom_classes: 7,
  };
  sorted.sort((a, b) => {
    const opOrder = { ADD: 0, MOD: 1, DEL: 2 };
    const opDiff = opOrder[a.operation] - opOrder[b.operation];
    if (opDiff !== 0) return opDiff;
    return (tableOrder[a.targetTable] ?? 99) - (tableOrder[b.targetTable] ?? 99);
  });

  for (const detail of sorted) {
    const { operation, targetTable } = detail;

    if (targetTable === 'classes') {
      if (operation === 'ADD') {
        statements.push(classAdd(detail));
        statements.push(...classIsARelation(detail));
      } else if (operation === 'MOD') {
        statements.push(classMod(detail));
        // Re-establish IS_A if parent changed
        const before = detail.beforeSnapshot as Record<string, unknown> | undefined;
        const after = detail.afterSnapshot as Record<string, unknown>;
        if (before?.parentId !== after.parentId) {
          if (before?.parentId) {
            statements.push({
              query: `MATCH (child:Class {id: $childId})-[r:IS_A]->(old:Class {id: $oldParentId}) DELETE r`,
              params: { childId: detail.targetId, oldParentId: before.parentId },
              description: `기존 IS_A 관계 제거`,
            });
          }
          statements.push(...classIsARelation(detail));
        }
      } else {
        statements.push(classDel(detail));
      }
    } else if (targetTable === 'instances') {
      if (operation === 'ADD') {
        statements.push(instanceAdd(detail));
        statements.push(...instanceClassEdge(detail));
      } else if (operation === 'MOD') {
        statements.push(instanceMod(detail));
        // Re-establish INSTANCE_OF if class changed
        const before = detail.beforeSnapshot as Record<string, unknown> | undefined;
        const after = detail.afterSnapshot as Record<string, unknown>;
        if (before?.classId !== after.classId) {
          if (before?.classId) {
            statements.push({
              query: `MATCH (i:Instance {id: $instanceId})-[r:INSTANCE_OF]->() DELETE r`,
              params: { instanceId: detail.targetId },
              description: `기존 INSTANCE_OF 관계 제거`,
            });
          }
          statements.push(...instanceClassEdge(detail));
        }
      } else {
        statements.push(instanceDel(detail));
      }
    } else if (targetTable === 'edges') {
      if (operation === 'ADD') {
        statements.push(edgeAdd(detail));
      } else if (operation === 'DEL') {
        statements.push(edgeDel(detail));
      }
      // MOD for edges: delete + re-add handled by frontend
    } else if (targetTable === 'properties') {
      if (operation === 'ADD') {
        statements.push(propertyAdd(detail));
      } else if (operation === 'DEL') {
        statements.push(propertyDel(detail));
      }
      // MOD for properties: similar to ADD (SET operation is idempotent)
      if (operation === 'MOD') {
        statements.push(propertyAdd(detail));
      }
    } else if (targetTable === 'relation_types') {
      if (operation === 'ADD') {
        statements.push(relationTypeAdd(detail));
      } else if (operation === 'DEL') {
        statements.push(relationTypeDel(detail));
      }
    }
    // instance_values, axioms, axiom_classes: metadata — stored in Supabase only for now
  }

  return statements;
}

// ─── Rollback: Generate reverse Cypher from before_snapshot ──

export function buildRollbackStatements(details: CommitDetail[]): CypherStatement[] {
  const reversed = [...details].reverse();
  const statements: CypherStatement[] = [];

  for (const detail of reversed) {
    const { operation, targetTable } = detail;

    if (operation === 'ADD') {
      // Reverse of ADD = DEL
      const delDetail: CommitDetail = {
        ...detail,
        operation: 'DEL',
        beforeSnapshot: detail.afterSnapshot,
      };
      if (targetTable === 'classes') statements.push(classDel(delDetail));
      else if (targetTable === 'instances') statements.push(instanceDel(delDetail));
      else if (targetTable === 'edges') statements.push(edgeDel(delDetail));
      else if (targetTable === 'relation_types') statements.push(relationTypeDel(delDetail));
    } else if (operation === 'DEL' && detail.beforeSnapshot) {
      // Reverse of DEL = ADD using before_snapshot
      const addDetail: CommitDetail = {
        ...detail,
        operation: 'ADD',
        afterSnapshot: detail.beforeSnapshot,
      };
      if (targetTable === 'classes') {
        statements.push(classAdd(addDetail));
        statements.push(...classIsARelation(addDetail));
      } else if (targetTable === 'instances') {
        statements.push(instanceAdd(addDetail));
        statements.push(...instanceClassEdge(addDetail));
      } else if (targetTable === 'edges') {
        statements.push(edgeAdd(addDetail));
      } else if (targetTable === 'relation_types') {
        statements.push(relationTypeAdd(addDetail));
      }
    } else if (operation === 'MOD' && detail.beforeSnapshot) {
      // Reverse of MOD = MOD back to before_snapshot
      const revertDetail: CommitDetail = {
        ...detail,
        afterSnapshot: detail.beforeSnapshot,
      };
      if (targetTable === 'classes') statements.push(classMod(revertDetail));
      else if (targetTable === 'instances') statements.push(instanceMod(revertDetail));
    }
  }

  return statements;
}

// ─── Preview: Format Cypher for display ─────────────────────

export function formatCypherPreview(statements: CypherStatement[]): string {
  return statements
    .map((s) => {
      // Replace params with readable values
      let query = s.query;
      for (const [key, value] of Object.entries(s.params)) {
        query = query.replace(`$${key}`, JSON.stringify(value));
      }
      return `// ${s.description}\n${query};`;
    })
    .join('\n\n');
}
