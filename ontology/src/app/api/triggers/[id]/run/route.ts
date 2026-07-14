import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { triggers, automationRuns, actionItems } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';
import { checkRateLimit, type RateLimit } from '@/lib/automation/ratelimit';

// PRD-PF-I M1: 수동 트리거 발화 → 결정함수 호출 → 판정 결과 기록 → (조치 필요 시) 제안 1건.
// ★완전자동 금지★: 제안은 action_items pending 까지만. 확정은 사람(액션보드). run 은 confirmed 로 못 만든다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ontologyId } = await getOntologyScope(request, 'editor');
    const db = await getDb();

    const trigger = await db.query.triggers.findFirst({
      where: and(eq(triggers.id, id), eq(triggers.ontologyId, ontologyId)),
    });
    if (!trigger) {
      return NextResponse.json({ error: '트리거를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 비활성 → skip 기록(왜 안 돌았는지 추적).
    if (!trigger.enabled) {
      const [run] = await db
        .insert(automationRuns)
        .values({ ontologyId, triggerId: id, status: 'skipped_disabled', actor: 'user' })
        .returning();
      return NextResponse.json({ run, skipped: 'disabled' });
    }

    // 레이트리밋 가드.
    const hourAgo = new Date(Date.now() - 3_600_000);
    const recent = await db.query.automationRuns.findMany({
      where: and(eq(automationRuns.triggerId, id), gte(automationRuns.createdAt, hourAgo)),
      columns: { createdAt: true },
    });
    const rl = checkRateLimit(
      recent.map((r) => +new Date(r.createdAt)),
      Date.now(),
      (trigger.rateLimit ?? {}) as RateLimit,
    );
    if (!rl.allowed) {
      const [run] = await db
        .insert(automationRuns)
        .values({
          ontologyId,
          triggerId: id,
          status: 'skipped_rate_limit',
          actor: 'user',
          output: { reason: rl.reason },
        })
        .returning();
      return NextResponse.json({ run, skipped: 'rate_limit', reason: rl.reason });
    }

    // 실행 기록 시작.
    const [run] = await db
      .insert(automationRuns)
      .values({ ontologyId, triggerId: id, status: 'running', startedAt: new Date(), actor: 'user' })
      .returning();

    // 결정함수 호출(판정 로직 위임). 트리거는 호출 여부만 결정.
    let output: Record<string, unknown> = {};
    let proposalId: string | null = null;
    let status: 'succeeded' | 'failed' = 'succeeded';
    let error: string | null = null;

    if (!trigger.targetFunctionId) {
      output = { note: '대상 결정함수 없음 — 실행 스킵' };
    } else {
      try {
        const origin = new URL(request.url).origin;
        const res = await fetch(`${origin}/api/functions/${trigger.targetFunctionId}/evaluate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-ontology-id': request.headers.get('x-ontology-id') ?? ontologyId,
            cookie: request.headers.get('cookie') ?? '',
          },
          body: JSON.stringify({ persist: true }),
        });
        output = await res.json();
        if (!res.ok) {
          status = 'failed';
          error = (output as { error?: string }).error ?? '결정함수 실행 실패';
        } else {
          // 조치 필요(이상) 판정이면 제안 1건 생성(파선/미확정).
          const verdict = (output as { verdict?: string }).verdict;
          const astFail = Array.isArray((output as { results?: { verdict?: { pass?: boolean } }[] }).results)
            ? (output as { results: { verdict?: { pass?: boolean } }[] }).results.some((r) => r.verdict?.pass === false)
            : false;
          const anomaly = verdict === 'fail' || verdict === 'warn' || astFail;
          if (anomaly) {
            const [proposal] = await db
              .insert(actionItems)
              .values({
                ontologyId,
                verdict: verdict === 'warn' ? 'warn' : 'fail',
                sourceFunctionId: trigger.targetFunctionId,
                evidence: { source: 'automation_run', runId: run.id, output },
                status: 'pending', // ★자율확정 금지★
              })
              .returning();
            proposalId = proposal.id;
          }
        }
      } catch (e) {
        status = 'failed';
        error = e instanceof Error ? e.message : '실행 오류';
      }
    }

    const [finished] = await db
      .update(automationRuns)
      .set({
        status,
        finishedAt: new Date(),
        output,
        actionProposalId: proposalId,
        error,
      })
      .where(eq(automationRuns.id, run.id))
      .returning();

    return NextResponse.json({ run: finished, proposalCreated: !!proposalId });
  } catch (err) {
    return handleApiError(err);
  }
}
