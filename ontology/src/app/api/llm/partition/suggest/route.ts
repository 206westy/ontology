import { NextResponse } from 'next/server';
import { generateText, Output } from 'ai';
import { openai } from '@ai-sdk/openai';
import { LLM_MODELS, LLM_MAX_RETRIES } from '@/lib/llm/models';
import {
  partitionSuggestRequestSchema,
  partitionNameResponseSchema,
} from '@/features/ontology/lib/schemas';
import { decidePartitionScope } from '@/features/ontology/lib/partition/suggest';

// PRD-N M1: AI 자동 구획 제안. 1차 판정은 결정론(decidePartitionScope) — 이름 겹침률.
// attach 는 무소음(LLM 미호출). new/bridge 일 때만 새 구획 이름·근거를 LLM 1회로 짓는다
// (비용 절제, v6 리스크 대응 계승). LLM 실패는 조용히 삼키지 않고 fallback 이름으로 유지.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = partitionSuggestRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { entities, relations, currentPartitionId, currentPartitionNodes, partitionsSummary } =
      parsed.data;

    const decision = decidePartitionScope(entities, relations, currentPartitionNodes, {
      currentPartitionId,
    });

    // 연결성 충분 → 현재 구획 귀속. 제안 카드 없음(수용 기준: 무소음 attach).
    if (decision.decision === 'attach') {
      return NextResponse.json({
        decision: 'attach',
        overlapRatio: decision.overlapRatio,
        bridges: [],
        unmatchedNames: decision.unmatchedNames,
      });
    }

    // new/bridge: 새 구획 이름 + 정성 근거 1회. 실패해도 결정론 결과는 보존.
    let suggestedPartitionName: string | null = null;
    let rationale: string | null = null;
    try {
      const named = await suggestPartitionName(
        decision.unmatchedNames,
        partitionsSummary.map((p) => p.name),
      );
      suggestedPartitionName = named.suggestedPartitionName;
      rationale = named.rationale;
    } catch {
      suggestedPartitionName = fallbackName(decision.unmatchedNames);
      rationale = null;
    }

    return NextResponse.json({
      decision: decision.decision,
      overlapRatio: decision.overlapRatio,
      suggestedPartitionName,
      bridges: decision.bridgeCandidates,
      unmatchedNames: decision.unmatchedNames,
      rationale,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function suggestPartitionName(
  unmatchedNames: string[],
  existingPartitionNames: string[],
): Promise<{ suggestedPartitionName: string; rationale: string }> {
  const system = `당신은 온톨로지의 새 구획(도메인 워크스페이스) 이름을 짓는다.
- 주어진 개념 목록이 어떤 도메인인지 함축하는 짧은 한국어 명사구(2~8자)를 제안한다.
- 기존 구획 이름과 겹치거나 헷갈리지 않게 한다.
- rationale 은 왜 별도 구획인지 한 문장 한국어로.`;

  const user = `새 구획에 들어갈 개념: ${unmatchedNames.join(', ') || '(없음)'}
기존 구획 이름(피할 것): ${existingPartitionNames.join(', ') || '(없음)'}`;

  const result = await generateText({
    model: openai(LLM_MODELS.primary),
    providerOptions: { openai: { reasoningEffort: 'low', textVerbosity: 'low' } },
    maxOutputTokens: 500,
    maxRetries: LLM_MAX_RETRIES,
    output: Output.object({ schema: partitionNameResponseSchema }),
    system,
    prompt: user,
  });

  const out = result.output;
  if (!out?.suggestedPartitionName) throw new Error('빈 구획 이름');
  return out;
}

function fallbackName(unmatchedNames: string[]): string {
  return unmatchedNames[0] ? `${unmatchedNames[0]} 구획` : '새 구획';
}
