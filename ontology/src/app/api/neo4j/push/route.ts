import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash } from 'crypto';
import { getDb } from '@/lib/drizzle';
import { commits, commitDetails, properties } from '@/lib/drizzle/schema';
import { inArray, sql } from 'drizzle-orm';
import { getNeo4jDriver } from '@/lib/neo4j/client';
import {
  buildCypherStatements,
  commitDetailSchema,
  formatCypherPreview,
  type CommitDetail,
  type PushContext,
  type PropertyMeta,
  type AttributionMeta,
  type InstanceValueMeta,
} from '@/lib/neo4j/cypher-builder';

// PRD-E P1-3: 스냅샷만으로 알 수 없는 정보(프로퍼티 메타·instance_values·어트리뷰션)를
// Supabase 에서 조회해 무손실 운반 context 를 구성한다.
async function buildPushContext(
  db: Awaited<ReturnType<typeof getDb>>,
  details: CommitDetail[],
): Promise<PushContext> {
  const snap = (d: CommitDetail) =>
    (d.afterSnapshot ?? d.beforeSnapshot ?? {}) as Record<string, unknown>;
  const beforeAfter = (d: CommitDetail) => [
    (d.afterSnapshot ?? {}) as Record<string, unknown>,
    (d.beforeSnapshot ?? {}) as Record<string, unknown>,
  ];

  // 1) 영향받는 클래스 / 인스턴스 / 프로퍼티 id 수집
  const classIds = new Set<string>();
  const instanceIds = new Set<string>();
  const propertyIds = new Set<string>();
  for (const d of details) {
    if (d.targetTable === 'classes') classIds.add(d.targetId);
    if (d.targetTable === 'instances') instanceIds.add(d.targetId);
    if (d.targetTable === 'properties') {
      for (const s of beforeAfter(d)) {
        if (s.classId) classIds.add(String(s.classId));
      }
    }
    if (d.targetTable === 'instance_values') {
      for (const s of beforeAfter(d)) {
        if (s.instanceId) instanceIds.add(String(s.instanceId));
        if (s.propertyId) propertyIds.add(String(s.propertyId));
      }
    }
    // 인스턴스의 소속 클래스도 propsSchema 대상 (값 캐스팅에 프로퍼티 필요)
    if (d.targetTable === 'instances') {
      const s = snap(d);
      if (s.classId) classIds.add(String(s.classId));
    }
  }

  const propertiesByClass: Record<string, PropertyMeta[]> = {};
  const propertyById: Record<string, PropertyMeta> = {};
  for (const cid of classIds) propertiesByClass[cid] = [];
  const toMeta = (p: typeof properties.$inferSelect): PropertyMeta => ({
    id: p.id,
    name: p.name,
    dataType: p.dataType,
    isRequired: p.isRequired,
    enumValues: (p.enumValues as string[] | null) ?? null,
  });

  const instanceValuesByInstance: Record<string, InstanceValueMeta[]> = {};
  const attrMap: Record<string, AttributionMeta> = {};
  const embeddings: Record<string, number[]> = {};

  // 어트리뷰션 대상 id (노드/관계 출처) — target 별 최신 1건
  const attrIds = [
    ...new Set(
      details
        .filter((d) =>
          ['classes', 'instances', 'edges', 'relation_types'].includes(
            d.targetTable,
          ),
        )
        .map((d) => d.targetId),
    ),
  ];

  // 시드니 링크 비용은 "왕복 횟수"가 지배한다(병렬화 무효). 위 5개의 독립 읽기
  // (프로퍼티·instance_values·어트리뷰션·클래스/인스턴스 임베딩)를 UNION ALL 단일
  // 왕복으로 합친다. 누락 프로퍼티 보충(아래)만 instance_values 의존이라 분리한다.
  const idArray = (ids: string[]) =>
    ids.length > 0
      ? sql`ARRAY[${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}]`
      : sql`ARRAY[]::uuid[]`;

  const classArr = [...classIds];
  const instanceArr = [...instanceIds];

  const ctxRows = (await db.execute(sql`
    SELECT 'prop'::text AS kind, jsonb_build_object(
      'id', p.id::text, 'classId', p.class_id::text, 'name', p.name,
      'dataType', p.data_type, 'isRequired', p.is_required, 'enumValues', p.enum_values
    ) AS data
    FROM properties p WHERE p.class_id = ANY(${idArray(classArr)})
    UNION ALL
    SELECT 'ival'::text, jsonb_build_object(
      'instanceId', v.instance_id::text, 'propertyId', v.property_id::text, 'value', v.value
    )
    FROM instance_values v WHERE v.instance_id = ANY(${idArray(instanceArr)})
    UNION ALL
    SELECT 'attr'::text, jsonb_build_object(
      'targetTable', a.target_table, 'targetId', a.target_id::text,
      'sourceType', a.source_type, 'confidence', a.confidence, 'sourceRef', a.source_ref,
      'createdAt', a.created_at
    )
    FROM attributions a WHERE a.target_id = ANY(${idArray(attrIds)})
    UNION ALL
    SELECT 'embClass'::text, jsonb_build_object('id', c.id::text, 'embedding', c.embedding::text::jsonb)
    FROM classes c WHERE c.id = ANY(${idArray(classArr)}) AND c.embedding IS NOT NULL
    UNION ALL
    SELECT 'embInst'::text, jsonb_build_object('id', i.id::text, 'embedding', i.embedding::text::jsonb)
    FROM instances i WHERE i.id = ANY(${idArray(instanceArr)}) AND i.embedding IS NOT NULL
  `)) as unknown as Array<{ kind: string; data: Record<string, unknown> }>;

  const attrRows: {
    targetTable: string;
    targetId: string;
    sourceType: string;
    confidence: number | null;
    sourceRef: string | null;
    createdAt: string;
  }[] = [];

  for (const row of ctxRows) {
    const d = row.data;
    if (row.kind === 'prop') {
      const meta: PropertyMeta = {
        id: String(d.id),
        name: String(d.name),
        dataType: String(d.dataType),
        isRequired: Boolean(d.isRequired),
        enumValues: (d.enumValues as string[] | null) ?? null,
      };
      (propertiesByClass[String(d.classId)] ??= []).push(meta);
      propertyById[meta.id] = meta;
    } else if (row.kind === 'ival') {
      (instanceValuesByInstance[String(d.instanceId)] ??= []).push({
        propertyId: String(d.propertyId),
        value: (d.value as string | null) ?? null,
      });
      propertyIds.add(String(d.propertyId));
    } else if (row.kind === 'attr') {
      attrRows.push({
        targetTable: String(d.targetTable),
        targetId: String(d.targetId),
        sourceType: String(d.sourceType),
        confidence: (d.confidence as number | null) ?? null,
        sourceRef: (d.sourceRef as string | null) ?? null,
        createdAt: String(d.createdAt),
      });
    } else if (Array.isArray(d.embedding)) {
      embeddings[String(d.id)] = d.embedding as number[];
    }
  }

  // createdAt 오름차순 정렬 후 덮어쓰기 → 최신이 남음 (원본 동작과 동일)
  attrRows.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  for (const a of attrRows) {
    attrMap[`${a.targetTable}:${a.targetId}`] = {
      sourceType: a.sourceType,
      confidence: a.confidence,
      sourceRef: a.sourceRef,
    };
  }

  // 누락된 프로퍼티 메타 보충 (값 캐스팅·삭제용) — instance_values 결과 의존이라
  // 위 통합 쿼리 뒤에 둔다. 영향 클래스의 프로퍼티가 이미 운반되므로 대개 비어 있다.
  const missing = [...propertyIds].filter((id) => !propertyById[id]);
  if (missing.length > 0) {
    const rows = await db.query.properties.findMany({
      where: inArray(properties.id, missing),
    });
    for (const p of rows) propertyById[p.id] = toMeta(p);
  }

  return {
    propertiesByClass,
    propertyById,
    instanceValuesByInstance,
    attributions: attrMap,
    embeddings,
  };
}

const pushRequestSchema = z.object({
  commitIds: z.array(z.string().uuid()).min(1),
  dryRun: z.boolean().optional().default(false),
});

export interface PushStep {
  index: number;
  total: number;
  description: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

export interface PushResponse {
  success: boolean;
  commitIds: string[];
  steps: PushStep[];
  cypherPreview?: string;
  error?: string;
  suggestion?: string;
  // H2: Neo4j 반영은 성공했으나 Supabase 동기화 플래그 갱신이 실패한 부분 성공 알림.
  warning?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = pushRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: '잘못된 요청입니다.',
          suggestion: 'commitIds 배열을 확인해주세요.',
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { commitIds, dryRun } = parsed.data;

    // 1. Fetch commit details from Supabase
    const db = await getDb();
    const details = await db.query.commitDetails.findMany({
      where: inArray(commitDetails.commitId, commitIds),
    });

    // PRD-E P3-1: 커밋별 결정적 해시(_SyncState 기록용 — drift 감지)
    const commitHashes: Record<string, string> = {};
    for (const commitId of commitIds) {
      const own = details
        .filter((d) => d.commitId === commitId)
        .map(
          (d) =>
            `${d.operation}:${d.targetTable}:${d.targetId}:${JSON.stringify(d.afterSnapshot ?? d.beforeSnapshot ?? null)}`,
        )
        .sort()
        .join('|');
      commitHashes[commitId] = createHash('sha1').update(own).digest('hex');
    }

    if (details.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '푸시할 변경사항이 없습니다.',
          suggestion: '커밋에 변경사항이 포함되어 있는지 확인해주세요.',
        },
        { status: 404 },
      );
    }

    // 2. Validate and build Cypher statements
    const validDetails = details.map((d) =>
      commitDetailSchema.parse({
        operation: d.operation,
        targetTable: d.targetTable,
        targetId: d.targetId,
        beforeSnapshot: d.beforeSnapshot,
        afterSnapshot: d.afterSnapshot,
      }),
    );

    // PRD-E P1-3: 무손실 운반 context 구성 후 Cypher 생성
    const context = await buildPushContext(db, validDetails);
    const statements = buildCypherStatements(validDetails, context);

    if (statements.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '생성할 Cypher 구문이 없습니다.',
          suggestion: '변경사항이 Neo4j에 반영 가능한 유형인지 확인해주세요.',
        },
        { status: 400 },
      );
    }

    // 3. Dry run: return Cypher preview without executing
    if (dryRun) {
      const preview = formatCypherPreview(statements);
      const steps: PushStep[] = statements.map((s, i) => ({
        index: i,
        total: statements.length,
        description: s.description,
        status: 'pending' as const,
      }));
      return NextResponse.json({
        success: true,
        commitIds,
        steps,
        cypherPreview: preview,
      });
    }

    // 4. Execute Cypher in a single transaction
    const driver = getNeo4jDriver();
    const session = driver.session();
    const steps: PushStep[] = [];

    try {
      await session.executeWrite(async (tx) => {
        for (let i = 0; i < statements.length; i++) {
          const stmt = statements[i];
          try {
            await tx.run(stmt.query, stmt.params);
            steps.push({
              index: i,
              total: statements.length,
              description: stmt.description,
              status: 'success',
            });
          } catch (err) {
            steps.push({
              index: i,
              total: statements.length,
              description: stmt.description,
              status: 'error',
              error: err instanceof Error ? err.message : '알 수 없는 오류',
            });
            // Throw to trigger transaction rollback
            throw err;
          }
        }
        // PRD-E P3-1: 동기화 상태 기록 (데이터와 같은 트랜잭션 → 원자적)
        for (const commitId of commitIds) {
          await tx.run(
            `MERGE (s:_SyncState {commit_id: $commitId}) SET s.hash = $hash, s.pushed_at = datetime()`,
            { commitId, hash: commitHashes[commitId] },
          );
        }
      });

      // 5. Mark commits as pushed in Supabase — 단일 왕복(commitId 당 1회 → IN 한 번).
      // H2: 이 업데이트는 Neo4j 트랜잭션 밖이다. Neo4j 가 이미 _SyncState 로 진실원을
      // 가지므로, 실패해도 데이터 손실은 없지만 양 DB 플래그가 어긋난다.
      // 짧게 재시도하고, 끝내 실패하면 "실패"가 아니라 "부분 성공(경고)"으로 보고한다.
      // (실패로 보고하면 사용자가 재반영해 중복 push 를 유발한다.)
      let flagUpdated = false;
      let flagError: string | undefined;
      for (let attempt = 0; attempt < 3 && !flagUpdated; attempt++) {
        try {
          await db
            .update(commits)
            .set({ pushedToNeo4j: true, pushedAt: new Date() })
            .where(inArray(commits.id, commitIds));
          flagUpdated = true;
        } catch (e) {
          flagError = e instanceof Error ? e.message : '알 수 없는 오류';
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
          }
        }
      }

      const response: PushResponse = {
        success: true,
        commitIds,
        steps,
        ...(flagUpdated
          ? {}
          : {
              warning:
                'Neo4j 반영은 완료됐지만 스테이징 동기화 표시 갱신에 실패했습니다. ' +
                '다음 동기화 점검(reconcile)에서 자동 정정되며, 재반영은 필요하지 않습니다.',
            }),
      };
      if (!flagUpdated) {
        console.error('[Neo4j Push] Supabase 동기화 플래그 갱신 실패:', flagError);
      }
      return NextResponse.json(response);
    } catch (err) {
      // Transaction was automatically rolled back by Neo4j
      const response: PushResponse = {
        success: false,
        commitIds,
        steps,
        error: '프로덕션 반영에 실패했습니다. 변경사항은 스테이징에 안전하게 보존되어 있습니다.',
        suggestion: '오류 내용을 확인 후 다시 시도해주세요. 문제가 계속되면 Neo4j 연결 상태를 확인하세요.',
      };
      return NextResponse.json(response, { status: 500 });
    } finally {
      await session.close();
    }
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: '서버 오류가 발생했습니다.',
        suggestion: '잠시 후 다시 시도해주세요.',
        detail: err instanceof Error ? err.message : undefined,
      },
      { status: 500 },
    );
  }
}
