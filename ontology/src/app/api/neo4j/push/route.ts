import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { commits, commitDetails } from '@/lib/drizzle/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getNeo4jDriver } from '@/lib/neo4j/client';
import {
  buildCypherStatements,
  commitDetailSchema,
  formatCypherPreview,
  type CypherStatement,
} from '@/lib/neo4j/cypher-builder';

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

    const statements = buildCypherStatements(validDetails);

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
      });

      // 5. Mark commits as pushed in Supabase
      for (const commitId of commitIds) {
        await db
          .update(commits)
          .set({ pushedToNeo4j: true, pushedAt: new Date() })
          .where(eq(commits.id, commitId));
      }

      const response: PushResponse = {
        success: true,
        commitIds,
        steps,
      };
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
