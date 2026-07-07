import { and, asc, eq, gt, isNull, desc } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import {
  branches,
  commits,
  commitDetails,
  classes,
  properties,
  instances,
  instanceValues,
  relationTypes,
  edges,
} from '@/lib/drizzle/schema';
import {
  computeNetDelta,
  buildMergePlan,
  sortForApplication,
  type DiffDetail,
  type MergePlan,
  type NetChange,
} from '@/features/ontology/lib/merge-diff';
import { DEFAULT_PARTITION_ID } from '@/features/ontology/lib/types';

// PRD-J M3: 병합 실행기(서버 전용).
// - loadMergePlan: 브랜치 순변화(mine) vs 분기 이후 main 순변화(theirs) → 병합 계획.
// - applyNetChangesToMain: 확정된 순변화를 main 엔티티 테이블에 적용(호출부 트랜잭션 안).
// 스냅샷은 스토어 형태(camelCase)라 drizzle 컬럼 프로퍼티와 이름이 일치한다.
// createdAt/updatedAt 은 스냅샷 값(문자열)을 신뢰하지 않고 DB 기본값/now 로 둔다.

type Db = Awaited<ReturnType<typeof getDb>>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const s = (v: unknown): string => v as string;
const so = (v: unknown): string | null => (v == null ? null : (v as string));
const num = (v: unknown): number | null => (v == null ? null : (v as number));

export interface MergeContext {
  branch: typeof branches.$inferSelect;
  plan: MergePlan;
  mineCount: number;
  theirsCount: number;
}

export async function loadMergePlan(
  db: Db,
  branchId: string,
): Promise<MergeContext | { error: string; status: number }> {
  const branch = await db.query.branches.findFirst({
    where: eq(branches.id, branchId),
  });
  if (!branch) return { error: '브랜치를 찾을 수 없습니다.', status: 404 };

  // mine: 브랜치 커밋 details (커밋 생성순 + 커밋 내 seq 순)
  const branchCommits = await db.query.commits.findMany({
    where: eq(commits.branchId, branchId),
    with: { details: { orderBy: [asc(commitDetails.seq)] } },
    orderBy: [asc(commits.createdAt)],
  });
  const mineDetails: DiffDetail[] = branchCommits.flatMap((c) =>
    c.details.map((d) => ({
      operation: d.operation as DiffDetail['operation'],
      targetTable: d.targetTable,
      targetId: d.targetId,
      beforeSnapshot: d.beforeSnapshot as Record<string, unknown> | null,
      afterSnapshot: d.afterSnapshot as Record<string, unknown> | null,
    })),
  );

  // theirs: 분기 이후 main 커밋 details.
  // base_commit_id 가 없으면(분기 시 main 커밋 0) main 전체가 "이후"다.
  let baseCreatedAt: Date | null = null;
  if (branch.baseCommitId) {
    const baseCommit = await db.query.commits.findFirst({
      columns: { createdAt: true },
      where: eq(commits.id, branch.baseCommitId),
    });
    baseCreatedAt = baseCommit?.createdAt ?? null;
  }

  const mainCommits = await db.query.commits.findMany({
    where: baseCreatedAt
      ? and(isNull(commits.branchId), gt(commits.createdAt, baseCreatedAt))
      : isNull(commits.branchId),
    with: { details: { orderBy: [asc(commitDetails.seq)] } },
    orderBy: [asc(commits.createdAt)],
  });
  const theirsDetails: DiffDetail[] = mainCommits.flatMap((c) =>
    c.details.map((d) => ({
      operation: d.operation as DiffDetail['operation'],
      targetTable: d.targetTable,
      targetId: d.targetId,
      beforeSnapshot: d.beforeSnapshot as Record<string, unknown> | null,
      afterSnapshot: d.afterSnapshot as Record<string, unknown> | null,
    })),
  );

  const mine = computeNetDelta(mineDetails);
  const theirs = computeNetDelta(theirsDetails);
  const plan = buildMergePlan(mine, theirs);

  return { branch, plan, mineCount: mine.size, theirsCount: theirs.size };
}

// ── main 엔티티 적용 ────────────────────────────────────────

async function upsertOne(tx: Tx, change: NetChange): Promise<void> {
  const d = (change.afterSnapshot ?? {}) as Record<string, unknown>;
  const id = change.targetId;

  switch (change.targetTable) {
    case 'classes': {
      const row = {
        id,
        parentId: so(d.parentId),
        partitionId: (d.partitionId as string | undefined) ?? DEFAULT_PARTITION_ID,
        name: s(d.name ?? ''),
        description: (d.description as string | undefined) ?? '',
        color: (d.color as string | undefined) ?? '#7c3aed',
        positionX: (d.positionX as number | undefined) ?? 0,
        positionY: (d.positionY as number | undefined) ?? 0,
        sourceType: so(d.sourceType),
        confidence: num(d.confidence),
        evidence: so(d.evidence),
      };
      const { id: _i, ...set } = row;
      await tx.insert(classes).values(row).onConflictDoUpdate({ target: classes.id, set });
      break;
    }
    case 'relation_types': {
      const row = {
        id,
        name: s(d.name ?? ''),
        description: (d.description as string | undefined) ?? '',
        ...(d.category ? { category: s(d.category) } : {}),
        sourceClassId: so(d.sourceClassId),
        targetClassId: so(d.targetClassId),
      };
      const { id: _i, ...set } = row;
      await tx
        .insert(relationTypes)
        .values(row)
        .onConflictDoUpdate({ target: relationTypes.id, set });
      break;
    }
    case 'properties': {
      const row = {
        id,
        classId: s(d.classId),
        name: s(d.name ?? ''),
        dataType: (d.dataType as string | undefined) ?? 'string',
        isRequired: (d.isRequired as boolean | undefined) ?? false,
        enumValues: d.enumValues ?? null,
        constraintRule: d.constraintRule ?? null,
        sortOrder: (d.sortOrder as number | undefined) ?? 0,
      };
      const { id: _i, ...set } = row;
      await tx
        .insert(properties)
        .values(row)
        .onConflictDoUpdate({ target: properties.id, set });
      break;
    }
    case 'instances': {
      const row = {
        id,
        classId: s(d.classId),
        name: s(d.name ?? ''),
        description: (d.description as string | undefined) ?? '',
      };
      const { id: _i, ...set } = row;
      await tx
        .insert(instances)
        .values(row)
        .onConflictDoUpdate({ target: instances.id, set });
      break;
    }
    case 'instance_values': {
      const row = {
        id,
        instanceId: s(d.instanceId),
        propertyId: s(d.propertyId),
        value: so(d.value),
      };
      // (instanceId, propertyId) UNIQUE 가 진짜 자연키 — id 충돌보다 먼저 걸린다.
      await tx
        .insert(instanceValues)
        .values(row)
        .onConflictDoUpdate({
          target: [instanceValues.instanceId, instanceValues.propertyId],
          set: { value: row.value },
        });
      break;
    }
    case 'edges': {
      const row = {
        id,
        relationTypeId: s(d.relationTypeId),
        sourceId: s(d.sourceId),
        targetId: s(d.targetId),
        sourceKind: s(d.sourceKind ?? 'class'),
        targetKind: s(d.targetKind ?? 'class'),
        isBridge: (d.isBridge as boolean | undefined) ?? false,
        minCardinality: num(d.minCardinality),
        maxCardinality: num(d.maxCardinality),
        sourceType: so(d.sourceType),
        confidence: num(d.confidence),
        evidence: so(d.evidence),
        categoryConfidence: num(d.categoryConfidence),
      };
      const { id: _i, ...set } = row;
      await tx.insert(edges).values(row).onConflictDoUpdate({ target: edges.id, set });
      break;
    }
    default:
      // 스토어 밖 테이블(과거 브랜치의 axioms detail 포함 — PRD-L M1 하위호환)은
      // 병합 대상이 아니다(방어적 스킵, 에러 없음).
      break;
  }
}

async function deleteOne(tx: Tx, change: NetChange): Promise<void> {
  const id = change.targetId;
  switch (change.targetTable) {
    case 'classes':
      await tx.delete(classes).where(eq(classes.id, id));
      break;
    case 'relation_types':
      await tx.delete(relationTypes).where(eq(relationTypes.id, id));
      break;
    case 'properties':
      await tx.delete(properties).where(eq(properties.id, id));
      break;
    case 'instances':
      await tx.delete(instances).where(eq(instances.id, id));
      break;
    case 'instance_values':
      await tx.delete(instanceValues).where(eq(instanceValues.id, id));
      break;
    case 'edges':
      await tx.delete(edges).where(eq(edges.id, id));
      break;
    default:
      break;
  }
}

// 확정된 순변화를 의존 순서대로 main 에 적용한다. 호출부가 트랜잭션을 감싼다.
export async function applyNetChangesToMain(
  tx: Tx,
  changes: NetChange[],
): Promise<void> {
  const ordered = sortForApplication(changes);
  for (const change of ordered) {
    if (change.operation === 'DEL') {
      await deleteOne(tx, change);
    } else {
      await upsertOne(tx, change);
    }
  }
}

// 병합 커밋용: 최신 main 커밋 id(부모 체인).
export async function latestMainCommitId(db: Db): Promise<string | null> {
  const row = await db.query.commits.findFirst({
    columns: { id: true },
    where: isNull(commits.branchId),
    orderBy: [desc(commits.createdAt)],
  });
  return row?.id ?? null;
}
