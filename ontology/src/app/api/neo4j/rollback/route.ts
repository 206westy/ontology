import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { commits, commitDetails } from '@/lib/drizzle/schema';
import { inArray } from 'drizzle-orm';
import { getNeo4jDriver } from '@/lib/neo4j/client';
import {
  buildRollbackStatements,
  commitDetailSchema,
  formatCypherPreview,
  type CypherStatement,
} from '@/lib/neo4j/cypher-builder';

const rollbackRequestSchema = z.object({
  commitIds: z.array(z.string().uuid()).min(1),
  dryRun: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = rollbackRequestSchema.safeParse(body);

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

    // 1. Verify commits were pushed
    const db = await getDb();
    const commitRows = await db.query.commits.findMany({
      where: inArray(commits.id, commitIds),
    });

    const unpushed = commitRows.filter((c) => !c.pushedToNeo4j);
    if (unpushed.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Neo4j에 푸시되지 않은 커밋은 롤백할 수 없습니다.',
          suggestion: '이미 푸시된 커밋만 선택해주세요.',
        },
        { status: 400 },
      );
    }

    // 2. Fetch commit details
    const details = await db.query.commitDetails.findMany({
      where: inArray(commitDetails.commitId, commitIds),
    });

    if (details.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '롤백할 변경사항이 없습니다.',
        },
        { status: 404 },
      );
    }

    // 3. Build rollback Cypher statements
    const validDetails = details.map((d) =>
      commitDetailSchema.parse({
        operation: d.operation,
        targetTable: d.targetTable,
        targetId: d.targetId,
        beforeSnapshot: d.beforeSnapshot,
        afterSnapshot: d.afterSnapshot,
      }),
    );

    const statements = buildRollbackStatements(validDetails);

    if (statements.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '생성할 롤백 Cypher 구문이 없습니다.',
        },
        { status: 400 },
      );
    }

    // 4. Dry run
    if (dryRun) {
      const preview = formatCypherPreview(statements);
      return NextResponse.json({
        success: true,
        commitIds,
        cypherPreview: preview,
        statementsCount: statements.length,
      });
    }

    // 5. Execute rollback in a single transaction
    const driver = getNeo4jDriver();
    const session = driver.session();

    try {
      await session.executeWrite(async (tx) => {
        for (const stmt of statements) {
          await tx.run(stmt.query, stmt.params);
        }
      });

      // 6. Mark commits as not pushed.
      // H2: Neo4j 롤백은 이미 커밋됐다. 이 Supabase 업데이트는 트랜잭션 밖이므로
      // 실패해도 데이터는 안전하지만 플래그가 어긋난다. 단일 왕복(inArray)으로 재시도하고,
      // 끝내 실패하면 "실패"가 아니라 "부분 성공(경고)"으로 보고한다(불필요한 재시도 방지).
      let flagUpdated = false;
      let flagError: string | undefined;
      for (let attempt = 0; attempt < 3 && !flagUpdated; attempt++) {
        try {
          await db
            .update(commits)
            .set({ pushedToNeo4j: false, pushedAt: null })
            .where(inArray(commits.id, commitIds));
          flagUpdated = true;
        } catch (e) {
          flagError = e instanceof Error ? e.message : '알 수 없는 오류';
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
          }
        }
      }
      if (!flagUpdated) {
        console.error('[Neo4j Rollback] Supabase 동기화 플래그 갱신 실패:', flagError);
      }

      return NextResponse.json({
        success: true,
        commitIds,
        message: '롤백이 완료되었습니다.',
        statementsExecuted: statements.length,
        ...(flagUpdated
          ? {}
          : {
              warning:
                'Neo4j 롤백은 완료됐지만 스테이징 동기화 표시 갱신에 실패했습니다. ' +
                '다음 동기화 점검(reconcile)에서 자동 정정됩니다.',
            }),
      });
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          error: '롤백에 실패했습니다. Neo4j 데이터 정합성을 확인해주세요.',
          suggestion: 'Neo4j Browser에서 직접 상태를 확인하시거나, 다시 시도해주세요.',
          detail: err instanceof Error ? err.message : undefined,
        },
        { status: 500 },
      );
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
