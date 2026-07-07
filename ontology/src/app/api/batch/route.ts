import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import {
  classes,
  properties,
  instances,
  instanceValues,
  edges,
  relationTypes,
  attributions,
} from '@/lib/drizzle/schema';
import { batchRequestSchema, type BatchOperation } from '@/features/ontology/lib/schemas';
import { DEFAULT_PARTITION_ID, toRelationLayer } from '@/features/ontology/lib/types';
import { mapAttributionSourceType } from '@/lib/attribution';
import { eq, sql } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';
import { recordRelationTerm, type RelationLayer } from '@/lib/relation-glossary';

// 생성 의존 순서: 다른 엔티티가 참조하는 것이 먼저.
const CREATE_ORDER = [
  'class',
  'relation_type',
  'property',
  'instance',
  'instance_value',
  'edge',
] as const;

// 삭제는 의존 역순(자식 먼저).
const DELETE_ORDER: Record<string, number> = {
  edge: 1,
  instance_value: 2,
  instance: 3,
  property: 4,
  relation_type: 5,
  class: 6,
};

type Tx = Parameters<Parameters<Awaited<ReturnType<typeof getDb>>['transaction']>[0]>[0];

interface OpResult {
  index: number;
  type: string;
  action: string;
  success: boolean;
  id?: string;
  error?: string;
}

const str = (v: unknown): string => v as string;
const optStr = (v: unknown): string | null => (v == null ? null : (v as string));

// provenance(sourceType 또는 evidence)가 있을 때만 어트리뷰션 기록 대상.
function attributionFor(
  targetTable: 'classes' | 'edges',
  targetId: string,
  data: Record<string, unknown>,
) {
  const sourceType = data.sourceType as string | null | undefined;
  const evidence = data.evidence as string | null | undefined;
  if (!sourceType && !evidence) return null;
  return {
    targetTable,
    targetId,
    sourceType: mapAttributionSourceType(sourceType),
    evidence: evidence ?? null,
    confidence: (data.confidence as number | null | undefined) ?? null,
    sourceRef: null as string | null,
  };
}

// 같은 테이블 create 를 multi-row 단일 insert 로 합쳐 시드니 왕복 수를 N→상수로 줄인다.
async function applyCreates(
  tx: Tx,
  creates: Array<BatchOperation & { __idx: number }>,
  results: OpResult[],
  // PRD-L M6 (L7): 생성된 관계유형 이름·레이어 수집 → 트랜잭션 커밋 후 어휘집 기록.
  recordedRelations: Array<{ name: string; layer: RelationLayer }>,
) {
  const byType = new Map<string, Array<BatchOperation & { __idx: number }>>();
  for (const op of creates) {
    const g = byType.get(op.type) ?? [];
    g.push(op);
    byType.set(op.type, g);
  }

  const attrRows: Array<ReturnType<typeof attributionFor>> = [];
  // (instanceId, propertyId) → {value, idx} 마지막 값 유지(한 배치 내 중복 충돌 방지).
  const ivMap = new Map<string, { instanceId: string; propertyId: string; value: string | null; idx?: number }>();

  for (const type of CREATE_ORDER) {
    const ops = byType.get(type);
    if (!ops || ops.length === 0) continue;

    if (type === 'class') {
      const rows = await tx
        .insert(classes)
        .values(
          ops.map((op) => {
            const d = op.data as Record<string, unknown>;
            return {
              ...(d.id ? { id: str(d.id) } : {}),
              name: str(d.name),
              parentId: optStr(d.parentId),
              partitionId: (d.partitionId as string | undefined) ?? DEFAULT_PARTITION_ID,
              description: (d.description as string | undefined) ?? '',
              color: (d.color as string | undefined) ?? '#7c3aed',
              positionX: (d.positionX as number | undefined) ?? 0,
              positionY: (d.positionY as number | undefined) ?? 0,
              sourceType: optStr(d.sourceType),
              confidence: (d.confidence as number | null | undefined) ?? null,
              evidence: optStr(d.evidence),
            };
          }),
        )
        .returning({ id: classes.id });
      ops.forEach((op, i) => {
        const id = rows[i].id;
        results.push({ index: op.__idx, type, action: 'create', success: true, id });
        const a = attributionFor('classes', id, op.data as Record<string, unknown>);
        if (a) attrRows.push(a);
      });
    } else if (type === 'relation_type') {
      const rows = await tx
        .insert(relationTypes)
        .values(
          ops.map((op) => {
            const d = op.data as Record<string, unknown>;
            return {
              ...(d.id ? { id: str(d.id) } : {}),
              name: str(d.name),
              description: (d.description as string | undefined) ?? '',
              // PRD-L M2: layer 보존 — 과거 category(5분류)는 하위호환 변환, 누락은 semantic.
              ...((d.layer ?? d.category) != null
                ? { layer: toRelationLayer(d.layer ?? d.category) }
                : {}),
              sourceClassId: optStr(d.sourceClassId),
              targetClassId: optStr(d.targetClassId),
            };
          }),
        )
        .returning({ id: relationTypes.id });
      ops.forEach((op, i) => {
        results.push({ index: op.__idx, type, action: 'create', success: true, id: rows[i].id });
        const d = op.data as Record<string, unknown>;
        const name = str(d.name);
        const raw = d.layer ?? d.category;
        recordedRelations.push({
          name,
          layer: raw != null ? toRelationLayer(raw) : 'semantic',
        });
      });
    } else if (type === 'property') {
      const rows = await tx
        .insert(properties)
        .values(
          ops.map((op) => {
            const d = op.data as Record<string, unknown>;
            return {
              ...(d.id ? { id: str(d.id) } : {}),
              classId: str(d.classId),
              name: str(d.name),
              dataType: (d.dataType as string | undefined) ?? 'string',
              isRequired: (d.isRequired as boolean | undefined) ?? false,
              enumValues: d.enumValues ?? null,
              constraintRule: d.constraintRule ?? null,
              sortOrder: (d.sortOrder as number | undefined) ?? 0,
            };
          }),
        )
        .returning({ id: properties.id });
      ops.forEach((op, i) =>
        results.push({ index: op.__idx, type, action: 'create', success: true, id: rows[i].id }),
      );
    } else if (type === 'instance') {
      const rows = await tx
        .insert(instances)
        .values(
          ops.map((op) => {
            const d = op.data as Record<string, unknown>;
            return {
              ...(d.id ? { id: str(d.id) } : {}),
              classId: str(d.classId),
              name: str(d.name),
              // RAG 문맥용 description 보존.
              description: (d.description as string | undefined) ?? '',
            };
          }),
        )
        .returning({ id: instances.id });
      ops.forEach((op, i) => {
        const id = rows[i].id;
        results.push({ index: op.__idx, type, action: 'create', success: true, id });
        // 중첩 values 가 있으면 instance_value upsert 로 합류.
        const nested = (op.data as Record<string, unknown>).values as
          | Array<{ propertyId: string; value?: string | null }>
          | undefined;
        if (nested) {
          for (const v of nested) {
            ivMap.set(`${id}:${v.propertyId}`, {
              instanceId: id,
              propertyId: v.propertyId,
              value: v.value ?? null,
            });
          }
        }
      });
    } else if (type === 'instance_value') {
      for (const op of ops) {
        const d = op.data as Record<string, unknown>;
        ivMap.set(`${str(d.instanceId)}:${str(d.propertyId)}`, {
          instanceId: str(d.instanceId),
          propertyId: str(d.propertyId),
          value: optStr(d.value),
          idx: op.__idx,
        });
      }
      // 결과는 upsert 이후 일괄 기록.
    } else if (type === 'edge') {
      const rows = await tx
        .insert(edges)
        .values(
          ops.map((op) => {
            const d = op.data as Record<string, unknown>;
            return {
              ...(d.id ? { id: str(d.id) } : {}),
              relationTypeId: str(d.relationTypeId),
              sourceId: str(d.sourceId),
              targetId: str(d.targetId),
              sourceKind: str(d.sourceKind),
              targetKind: str(d.targetKind),
              isBridge: (d.isBridge as boolean | undefined) ?? false,
              sourceType: optStr(d.sourceType),
              confidence: (d.confidence as number | null | undefined) ?? null,
              evidence: optStr(d.evidence),
            };
          }),
        )
        .returning({ id: edges.id });
      ops.forEach((op, i) => {
        const id = rows[i].id;
        results.push({ index: op.__idx, type, action: 'create', success: true, id });
        const a = attributionFor('edges', id, op.data as Record<string, unknown>);
        if (a) attrRows.push(a);
      });
    }
  }

  // instance_values 일괄 upsert (instanceId+propertyId 충돌 시 값 갱신).
  const ivRows = [...ivMap.values()];
  if (ivRows.length > 0) {
    await tx
      .insert(instanceValues)
      .values(ivRows.map((v) => ({ instanceId: v.instanceId, propertyId: v.propertyId, value: v.value })))
      .onConflictDoUpdate({
        target: [instanceValues.instanceId, instanceValues.propertyId],
        set: { value: sql`excluded.value` },
      });
    for (const v of ivRows) {
      if (v.idx !== undefined) {
        results.push({ index: v.idx, type: 'instance_value', action: 'create', success: true });
      }
    }
  }

  // 어트리뷰션 일괄 기록(단일 진실원) — provenance 있는 것만.
  if (attrRows.length > 0) {
    await tx.insert(attributions).values(attrRows.map((a) => a!));
  }
}

// update/delete 는 기존 per-op 로직 유지(useApiSync 의 새 ADD 경로는 create 만 보냄).
async function applyMutation(
  tx: Tx,
  op: BatchOperation & { __idx: number },
  results: OpResult[],
) {
  const data = op.data as Record<string, unknown>;
  const { id: _id, ...fields } = data;
  const resultId = op.id;

  if (op.action === 'update' && op.id) {
    if (op.type === 'class') {
      await tx.update(classes).set({ ...fields, updatedAt: sql`now()` } as any).where(eq(classes.id, op.id));
    } else if (op.type === 'relation_type') {
      await tx.update(relationTypes).set(fields as any).where(eq(relationTypes.id, op.id));
    } else if (op.type === 'property') {
      await tx.update(properties).set(fields as any).where(eq(properties.id, op.id));
    } else if (op.type === 'instance') {
      await tx.update(instances).set({ ...fields, updatedAt: sql`now()` } as any).where(eq(instances.id, op.id));
    }
  } else if (op.action === 'delete' && op.id) {
    if (op.type === 'class') await tx.delete(classes).where(eq(classes.id, op.id));
    else if (op.type === 'relation_type') await tx.delete(relationTypes).where(eq(relationTypes.id, op.id));
    else if (op.type === 'property') await tx.delete(properties).where(eq(properties.id, op.id));
    else if (op.type === 'instance') await tx.delete(instances).where(eq(instances.id, op.id));
    else if (op.type === 'instance_value') await tx.delete(instanceValues).where(eq(instanceValues.id, op.id));
    else if (op.type === 'edge') await tx.delete(edges).where(eq(edges.id, op.id));
  }

  results.push({ index: op.__idx, type: op.type, action: op.action, success: true, id: resultId });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = batchRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const ops = parsed.data.operations.map((op, __idx) => ({ ...op, __idx }));
    const creates = ops.filter((o) => o.action === 'create');
    const updates = ops.filter((o) => o.action === 'update');
    const deletes = ops
      .filter((o) => o.action === 'delete')
      .sort((a, b) => (DELETE_ORDER[a.type] ?? 99) - (DELETE_ORDER[b.type] ?? 99));

    const db = await getDb();
    const results: OpResult[] = [];
    const recordedRelations: Array<{ name: string; layer: RelationLayer }> = [];

    await db.transaction(async (tx) => {
      try {
        await applyCreates(tx, creates, results, recordedRelations);
        for (const op of updates) await applyMutation(tx, op, results);
        for (const op of deletes) await applyMutation(tx, op, results);
      } catch (err) {
        throw new Error(
          `Batch failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        );
      }
    });

    // PRD-L M6 (L7): 커밋 성공 후 관계 어휘집 사후 기록(비치명 — recordRelationTerm 내부에서 흡수).
    for (const rel of recordedRelations) {
      await recordRelationTerm(db, { name: rel.name, layer: rel.layer, sourceRef: 'batch' });
    }

    results.sort((a, b) => a.index - b.index);

    return NextResponse.json(
      { success: true, operationCount: results.length, results },
      { status: 201 },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
