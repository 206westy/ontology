import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import {
  classes,
  properties,
  instances,
  instanceValues,
  edges,
  constraints,
  validationResults,
} from '@/lib/drizzle/schema';
import { validateRequestSchema } from '@/features/ontology/lib/schemas';
import { findSimilarPairs } from '@/features/ontology/lib/similarity';
import { eq } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

// Drizzle relational query on self-referencing tables can lose type info.
// Explicit row type avoids `unknown` inference for classes columns.
interface ClassRow {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  color: string;
  positionX: number;
  positionY: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  ruleCode: string;
  message: string;
  targetTable: string;
  targetId: string;
  constraintId?: string;
}

// Rule: Cyclic is-a detection (class hierarchy must be a DAG)
async function checkCyclicIsA(
  db: Awaited<ReturnType<typeof getDb>>,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const allClasses = await db.query.classes.findMany() as unknown as ClassRow[];

  const parentMap = new Map<string, string | null>();
  for (const cls of allClasses) {
    parentMap.set(cls.id, cls.parentId);
  }

  for (const cls of allClasses) {
    const visited = new Set<string>();
    let current: string | null = cls.id;

    while (current) {
      if (visited.has(current)) {
        issues.push({
          severity: 'error',
          ruleCode: 'cyclic_isa',
          message: `순환 is-a 관계가 감지되었습니다: 클래스 "${cls.name}"이 자기 자신의 상위 클래스로 이어집니다.`,
          targetTable: 'classes',
          targetId: cls.id,
        });
        break;
      }
      visited.add(current);
      current = parentMap.get(current) ?? null;
    }
  }

  return issues;
}

// Rule: Required properties check (instances must fill required props)
async function checkRequiredProperties(
  db: Awaited<ReturnType<typeof getDb>>,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const allInstances = await db.query.instances.findMany({
    with: { values: true },
  });
  const requiredProps = await db.query.properties.findMany({
    where: eq(properties.isRequired, true),
  });

  const requiredByClass = new Map<string, typeof requiredProps>();
  for (const prop of requiredProps) {
    const existing = requiredByClass.get(prop.classId) ?? [];
    existing.push(prop);
    requiredByClass.set(prop.classId, existing);
  }

  for (const inst of allInstances) {
    const required = requiredByClass.get(inst.classId) ?? [];
    const filledPropIds = new Set(inst.values.map((v) => v.propertyId));

    for (const prop of required) {
      if (!filledPropIds.has(prop.id)) {
        issues.push({
          severity: 'error',
          ruleCode: 'required_properties',
          message: `인스턴스 "${inst.name}"에 필수 프로퍼티 "${prop.name}"의 값이 누락되었습니다.`,
          targetTable: 'instances',
          targetId: inst.id,
        });
        continue;
      }

      const val = inst.values.find((v) => v.propertyId === prop.id);
      if (val && (val.value === null || val.value === '')) {
        issues.push({
          severity: 'error',
          ruleCode: 'required_properties',
          message: `인스턴스 "${inst.name}"의 필수 프로퍼티 "${prop.name}" 값이 비어있습니다.`,
          targetTable: 'instances',
          targetId: inst.id,
        });
      }
    }
  }

  return issues;
}

// Rule: Cardinality violation check (edges with min/max cardinality on constraints)
async function checkCardinality(
  db: Awaited<ReturnType<typeof getDb>>,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const cardinalityConstraints = await db.query.constraints.findMany({
    where: eq(constraints.constraintType, 'cardinality'),
  });

  if (cardinalityConstraints.length === 0) return issues;

  const allEdges = await db.query.edges.findMany();

  for (const constraint of cardinalityConstraints) {
    if (!constraint.isActive) continue;
    if (!constraint.sourceClassId || !constraint.relationTypeId) continue;

    const config = constraint.config as Record<string, unknown>;
    const minCard = (config.min as number) ?? null;
    const maxCard = (config.max as number) ?? null;

    // Get all instances of the source class
    const sourceInstances = await db.query.instances.findMany({
      where: eq(instances.classId, constraint.sourceClassId),
    });

    // For classes: count outgoing edges of the specific relation type
    const sourceClassIds = [constraint.sourceClassId, ...sourceInstances.map((i) => i.id)];

    for (const sourceId of sourceClassIds) {
      const outgoingCount = allEdges.filter(
        (e) =>
          e.sourceId === sourceId &&
          e.relationTypeId === constraint.relationTypeId,
      ).length;

      if (minCard !== null && outgoingCount < minCard) {
        issues.push({
          severity: constraint.severity as 'error' | 'warning' | 'info',
          ruleCode: 'cardinality',
          message: `카디널리티 위반: 최소 ${minCard}개의 관계가 필요하지만 ${outgoingCount}개만 존재합니다.`,
          targetTable: 'edges',
          targetId: sourceId,
          constraintId: constraint.id,
        });
      }

      if (maxCard !== null && outgoingCount > maxCard) {
        issues.push({
          severity: constraint.severity as 'error' | 'warning' | 'info',
          ruleCode: 'cardinality',
          message: `카디널리티 위반: 최대 ${maxCard}개의 관계만 허용되지만 ${outgoingCount}개가 존재합니다.`,
          targetTable: 'edges',
          targetId: sourceId,
          constraintId: constraint.id,
        });
      }
    }
  }

  return issues;
}

// Rule: Orphan node detection (classes/instances with no edges)
async function checkOrphanNodes(
  db: Awaited<ReturnType<typeof getDb>>,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const allClasses = await db.query.classes.findMany() as unknown as ClassRow[];
  const allInstances = await db.query.instances.findMany();
  const allEdges = await db.query.edges.findMany();

  const connectedIds = new Set<string>();
  for (const edge of allEdges) {
    connectedIds.add(edge.sourceId as string);
    connectedIds.add(edge.targetId as string);
  }

  // Classes: orphan = no edges AND no parent AND no children AND no instances
  const classIdsWithChildren = new Set(
    allClasses.filter((c) => c.parentId).map((c) => c.parentId!),
  );
  const classIdsWithInstances = new Set(allInstances.map((i) => i.classId));

  for (const cls of allClasses) {
    const hasEdge = connectedIds.has(cls.id);
    const hasParent = cls.parentId !== null;
    const hasChildren = classIdsWithChildren.has(cls.id);
    const hasInstances = classIdsWithInstances.has(cls.id);

    if (!hasEdge && !hasParent && !hasChildren && !hasInstances) {
      issues.push({
        severity: 'info',
        ruleCode: 'orphan_nodes',
        message: `클래스 "${cls.name}"이 어떤 관계, 하위 클래스, 인스턴스도 없는 고아 노드입니다.`,
        targetTable: 'classes',
        targetId: cls.id,
      });
    }
  }

  return issues;
}

// Rule: Similar name detection (shared Levenshtein-based util)
async function checkSimilarNames(
  db: Awaited<ReturnType<typeof getDb>>,
): Promise<ValidationIssue[]> {
  const allClasses = (await db.query.classes.findMany()) as unknown as ClassRow[];
  const pairs = findSimilarPairs(allClasses.map((c) => ({ id: c.id, name: c.name })));

  return pairs.map(({ a, b, score, exact }) => ({
    severity: 'warning' as const,
    ruleCode: 'similar_names',
    message: exact
      ? `클래스 "${a.name}"과 "${b.name}"의 이름이 동일합니다 (다른 상위 클래스).`
      : `클래스 "${a.name}"과 "${b.name}"의 이름이 매우 유사합니다 (유사도: ${Math.round(score * 100)}%). 중복 여부를 확인하세요.`,
    targetTable: 'classes',
    targetId: b.id,
  }));
}

// Map of all available rules
const RULES: Record<
  string,
  (db: Awaited<ReturnType<typeof getDb>>) => Promise<ValidationIssue[]>
> = {
  cyclic_isa: checkCyclicIsA,
  required_properties: checkRequiredProperties,
  cardinality: checkCardinality,
  orphan_nodes: checkOrphanNodes,
  similar_names: checkSimilarNames,
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = validateRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();
    const rulesToRun = parsed.data.rules ?? Object.keys(RULES);

    const allIssues: ValidationIssue[] = [];

    for (const ruleName of rulesToRun) {
      const runner = RULES[ruleName];
      if (!runner) continue;
      const issues = await runner(db);
      allIssues.push(...issues);
    }

    // Persist results to validation_results table
    const runId = crypto.randomUUID();
    if (allIssues.length > 0) {
      await db.insert(validationResults).values(
        allIssues.map((issue) => ({
          runId,
          severity: issue.severity,
          ruleCode: issue.ruleCode,
          message: issue.message,
          targetTable: issue.targetTable,
          targetId: issue.targetId,
          constraintId: issue.constraintId ?? null,
        })),
      );
    }

    // Categorize results
    const errors = allIssues.filter((i) => i.severity === 'error');
    const warnings = allIssues.filter((i) => i.severity === 'warning');
    const infos = allIssues.filter((i) => i.severity === 'info');

    return NextResponse.json({
      runId,
      summary: {
        total: allIssues.length,
        errors: errors.length,
        warnings: warnings.length,
        infos: infos.length,
      },
      errors,
      warnings,
      infos,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
