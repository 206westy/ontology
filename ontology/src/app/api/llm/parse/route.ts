import { NextResponse } from 'next/server';
import { generateText, Output } from 'ai';
import { openai } from '@ai-sdk/openai';
import {
  parseRequestSchema,
  parseStage1ResponseSchema,
  parseStage2ResponseSchema,
  type ParseResponse,
} from '@/features/ontology/lib/schemas';
import {
  buildStage1System,
  buildStage1User,
  buildStage2System,
  buildStage2User,
  buildStage1SystemCsv,
  buildStage1UserCsv,
  buildStage2SystemCsv,
} from '@/features/ontology/lib/parse-prompts';
import { LLM_MODELS, LLM_MAX_RETRIES } from '@/lib/llm/models';

// Single-call parse cap. Larger documents overflow maxOutputTokens and send the
// SDK into a retry loop (PATCH-4). True bulk ingestion (chunking) is P2 scope.
const PARSE_CHAR_LIMIT = 8000;
// M5: CSV is denser per char and the user caps it by total text, not row count.
// A larger budget (and bigger output cap) lets a whole table land in one call.
const PARSE_CHAR_LIMIT_CSV = 15000;
const MAX_OUTPUT_TOKENS = 16000;
const MAX_OUTPUT_TOKENS_CSV = 32000;

// Multi-stage parse (A-1): Stage 1 extracts entities (points), Stage 2 extracts
// grounded relations (lines). Splitting the calls removes the title-hub bias of
// the old single-call extraction and lets each call stay small and focused.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = parseRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { text, inputKind } = parsed.data;
    const isCsv = inputKind === 'csv';
    const charLimit = isCsv ? PARSE_CHAR_LIMIT_CSV : PARSE_CHAR_LIMIT;
    const maxOutputTokens = isCsv ? MAX_OUTPUT_TOKENS_CSV : MAX_OUTPUT_TOKENS;

    if (text.length > charLimit) {
      return NextResponse.json(
        {
          error: `${isCsv ? 'CSV 데이터' : '문서'}가 너무 깁니다 (${text.length.toLocaleString()}자). ${charLimit.toLocaleString()}자 이하로 나눠 입력해 주세요.`,
          code: 'INPUT_TOO_LARGE',
        },
        { status: 413 },
      );
    }

    // ── Stage 1: entities + types (no relations) ──
    const stage1 = await generateText({
      model: openai(LLM_MODELS.primary),
      providerOptions: { openai: { reasoningEffort: 'medium', textVerbosity: 'low' } },
      maxOutputTokens,
      maxRetries: LLM_MAX_RETRIES,
      output: Output.object({ schema: parseStage1ResponseSchema }),
      system: isCsv ? buildStage1SystemCsv() : buildStage1System(),
      prompt: isCsv ? buildStage1UserCsv(parsed.data) : buildStage1User(parsed.data),
    });

    if (!stage1.output) {
      return NextResponse.json(
        { error: 'Empty response from LLM (stage 1)' },
        { status: 500 },
      );
    }

    const entities = stage1.output.entities;

    // ── Stage 2: grounded relations only ──
    // Skip the call entirely when there is nothing to connect (≤1 entity).
    let relations: ParseResponse['relations'] = [];
    const warnings: string[] = [];
    if (entities.length >= 2) {
      const stage2 = await generateText({
        model: openai(LLM_MODELS.primary),
        providerOptions: { openai: { reasoningEffort: 'medium', textVerbosity: 'low' } },
        maxOutputTokens,
        maxRetries: LLM_MAX_RETRIES,
        output: Output.object({ schema: parseStage2ResponseSchema }),
        system: isCsv ? buildStage2SystemCsv() : buildStage2System(),
        prompt: buildStage2User(parsed.data, entities),
      });
      relations = stage2.output?.relations ?? [];
      // H1: 엔티티가 2개 이상인데 관계 단계가 빈 결과를 내면 조용히 "성공(관계 0개)"으로
      // 흘려보내지 않고 경고로 노출한다(관계 추출 실패 가능성 알림).
      if (!stage2.output) {
        warnings.push(
          '관계 추출 단계가 결과를 반환하지 못했습니다. 관계가 누락됐을 수 있으니 확인하거나 다시 시도해 주세요.',
        );
      } else if (relations.length === 0) {
        warnings.push(
          `엔티티 ${entities.length}개에서 관계를 찾지 못했습니다. 관계가 누락됐을 수 있습니다.`,
        );
      }
    }

    const response: ParseResponse & { warnings?: string[] } = {
      entities,
      relations,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
