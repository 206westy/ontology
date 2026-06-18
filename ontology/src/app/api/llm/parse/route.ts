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
} from '@/features/ontology/lib/parse-prompts';

// Single-call parse cap. Larger documents overflow maxOutputTokens and send the
// SDK into a retry loop (PATCH-4). True bulk ingestion (chunking) is P2 scope.
const PARSE_CHAR_LIMIT = 8000;

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

    const { text } = parsed.data;

    if (text.length > PARSE_CHAR_LIMIT) {
      return NextResponse.json(
        {
          error: `문서가 너무 깁니다 (${text.length.toLocaleString()}자). ${PARSE_CHAR_LIMIT.toLocaleString()}자 이하로 섹션을 나눠 입력해 주세요.`,
          code: 'INPUT_TOO_LARGE',
        },
        { status: 413 },
      );
    }

    // ── Stage 1: entities + types (no relations) ──
    const stage1 = await generateText({
      model: openai('gpt-5.4'),
      providerOptions: { openai: { reasoningEffort: 'medium', textVerbosity: 'low' } },
      maxOutputTokens: 16000,
      maxRetries: 1,
      output: Output.object({ schema: parseStage1ResponseSchema }),
      system: buildStage1System(),
      prompt: buildStage1User(parsed.data),
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
    if (entities.length >= 2) {
      const stage2 = await generateText({
        model: openai('gpt-5.4'),
        providerOptions: { openai: { reasoningEffort: 'medium', textVerbosity: 'low' } },
        maxOutputTokens: 16000,
        maxRetries: 1,
        output: Output.object({ schema: parseStage2ResponseSchema }),
        system: buildStage2System(),
        prompt: buildStage2User(parsed.data, entities),
      });
      relations = stage2.output?.relations ?? [];
    }

    const response: ParseResponse = { entities, relations };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
