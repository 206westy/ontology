import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import {
  classes,
  properties,
  instances,
  instanceValues,
  edges,
  relationTypes,
  axioms,
  axiomClasses,
} from '@/lib/drizzle/schema';
import { batchRequestSchema, type BatchOperation } from '@/features/ontology/lib/schemas';
import { eq, sql } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

// Topology sort order: entities that others depend on come first
const ENTITY_ORDER: Record<string, number> = {
  class: 0,
  relation_type: 1,
  property: 2,
  instance: 3,
  instance_value: 4,
  edge: 5,
  axiom: 6,
};

// For deletes, reverse the order (dependents first)
function sortOperations(ops: BatchOperation[]): BatchOperation[] {
  return [...ops].sort((a, b) => {
    if (a.action === 'delete' && b.action === 'delete') {
      return (ENTITY_ORDER[b.type] ?? 99) - (ENTITY_ORDER[a.type] ?? 99);
    }
    if (a.action === 'delete') return 1;
    if (b.action === 'delete') return -1;

    // Creates before updates
    const actionOrder = { create: 0, update: 1, delete: 2 };
    const actionDiff = actionOrder[a.action] - actionOrder[b.action];
    if (actionDiff !== 0) return actionDiff;

    return (ENTITY_ORDER[a.type] ?? 99) - (ENTITY_ORDER[b.type] ?? 99);
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = batchRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const sorted = sortOperations(parsed.data.operations);
    const db = await getDb();

    const results: Array<{
      index: number;
      type: string;
      action: string;
      success: boolean;
      id?: string;
      error?: string;
    }> = [];

    // Execute all operations in a single Drizzle transaction
    await db.transaction(async (tx) => {
      for (let i = 0; i < sorted.length; i++) {
        const op = sorted[i];
        const data = op.data as Record<string, unknown>;

        try {
          let resultId: string | undefined;

          if (op.type === 'class') {
            if (op.action === 'create') {
              const [row] = await tx
                .insert(classes)
                .values({
                  ...(data.id ? { id: data.id as string } : {}),
                  name: data.name as string,
                  parentId: (data.parentId as string) ?? null,
                  description: (data.description as string) ?? '',
                  color: (data.color as string) ?? '#7c3aed',
                  positionX: (data.positionX as number) ?? 0,
                  positionY: (data.positionY as number) ?? 0,
                })
                .returning();
              resultId = row.id;
            } else if (op.action === 'update' && op.id) {
              const { id: _id, ...fields } = data;
              await tx
                .update(classes)
                .set({ ...fields, updatedAt: sql`now()` } as any)
                .where(eq(classes.id, op.id));
              resultId = op.id;
            } else if (op.action === 'delete' && op.id) {
              await tx.delete(classes).where(eq(classes.id, op.id));
              resultId = op.id;
            }
          } else if (op.type === 'relation_type') {
            if (op.action === 'create') {
              const [row] = await tx
                .insert(relationTypes)
                .values({
                  ...(data.id ? { id: data.id as string } : {}),
                  name: data.name as string,
                  description: (data.description as string) ?? '',
                  sourceClassId: (data.sourceClassId as string) ?? null,
                  targetClassId: (data.targetClassId as string) ?? null,
                })
                .returning();
              resultId = row.id;
            } else if (op.action === 'update' && op.id) {
              const { id: _id, ...fields } = data;
              await tx
                .update(relationTypes)
                .set(fields as any)
                .where(eq(relationTypes.id, op.id));
              resultId = op.id;
            } else if (op.action === 'delete' && op.id) {
              await tx.delete(relationTypes).where(eq(relationTypes.id, op.id));
              resultId = op.id;
            }
          } else if (op.type === 'property') {
            if (op.action === 'create') {
              const [row] = await tx
                .insert(properties)
                .values({
                  ...(data.id ? { id: data.id as string } : {}),
                  classId: data.classId as string,
                  name: data.name as string,
                  dataType: (data.dataType as string) ?? 'string',
                  isRequired: (data.isRequired as boolean) ?? false,
                  enumValues: data.enumValues ?? null,
                  constraintRule: data.constraintRule ?? null,
                  sortOrder: (data.sortOrder as number) ?? 0,
                })
                .returning();
              resultId = row.id;
            } else if (op.action === 'update' && op.id) {
              const { id: _id, ...fields } = data;
              await tx
                .update(properties)
                .set(fields as any)
                .where(eq(properties.id, op.id));
              resultId = op.id;
            } else if (op.action === 'delete' && op.id) {
              await tx.delete(properties).where(eq(properties.id, op.id));
              resultId = op.id;
            }
          } else if (op.type === 'instance') {
            if (op.action === 'create') {
              const [row] = await tx
                .insert(instances)
                .values({
                  ...(data.id ? { id: data.id as string } : {}),
                  classId: data.classId as string,
                  name: data.name as string,
                })
                .returning();
              resultId = row.id;
            } else if (op.action === 'update' && op.id) {
              const { id: _id, ...fields } = data;
              await tx
                .update(instances)
                .set({ ...fields, updatedAt: sql`now()` } as any)
                .where(eq(instances.id, op.id));
              resultId = op.id;
            } else if (op.action === 'delete' && op.id) {
              await tx.delete(instances).where(eq(instances.id, op.id));
              resultId = op.id;
            }
          } else if (op.type === 'instance_value') {
            if (op.action === 'create') {
              const [row] = await tx
                .insert(instanceValues)
                .values({
                  instanceId: data.instanceId as string,
                  propertyId: data.propertyId as string,
                  value: (data.value as string) ?? null,
                })
                .returning();
              resultId = row.id;
            } else if (op.action === 'delete' && op.id) {
              await tx.delete(instanceValues).where(eq(instanceValues.id, op.id));
              resultId = op.id;
            }
          } else if (op.type === 'edge') {
            if (op.action === 'create') {
              const [row] = await tx
                .insert(edges)
                .values({
                  ...(data.id ? { id: data.id as string } : {}),
                  relationTypeId: data.relationTypeId as string,
                  sourceId: data.sourceId as string,
                  targetId: data.targetId as string,
                  sourceKind: data.sourceKind as string,
                  targetKind: data.targetKind as string,
                })
                .returning();
              resultId = row.id;
            } else if (op.action === 'delete' && op.id) {
              await tx.delete(edges).where(eq(edges.id, op.id));
              resultId = op.id;
            }
          } else if (op.type === 'axiom') {
            if (op.action === 'create') {
              const [row] = await tx
                .insert(axioms)
                .values({
                  ...(data.id ? { id: data.id as string } : {}),
                  description: data.description as string,
                  ruleLogic: data.ruleLogic ?? {},
                  severity: (data.severity as string) ?? 'warning',
                })
                .returning();
              resultId = row.id;

              const classIds = data.classIds as string[] | undefined;
              if (classIds && classIds.length > 0) {
                await tx.insert(axiomClasses).values(
                  classIds.map((classId) => ({
                    axiomId: row.id,
                    classId,
                  })),
                );
              }
            } else if (op.action === 'delete' && op.id) {
              await tx.delete(axioms).where(eq(axioms.id, op.id));
              resultId = op.id;
            }
          }

          results.push({
            index: i,
            type: op.type,
            action: op.action,
            success: true,
            id: resultId,
          });
        } catch (err) {
          // On any error, the entire transaction is rolled back
          throw new Error(
            `Operation ${i} (${op.action} ${op.type}) failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
          );
        }
      }
    });

    return NextResponse.json(
      {
        success: true,
        operationCount: results.length,
        results,
      },
      { status: 201 },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
