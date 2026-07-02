import { NextResponse } from 'next/server';
import { parseRequestSchema } from '@/features/ontology/lib/schemas';
import {
  needsChunking,
  SINGLE_CHUNK_CHAR_LIMIT,
} from '@/features/ontology/lib/chunk';
import { runSingle, runChunked } from '@/lib/llm/parse-pipeline';

// M5: CSV 는 청킹 비대상 — 자체 상한 유지. 텍스트 상한(P2-1)은 제거됐다.
const PARSE_CHAR_LIMIT_CSV = 15000;

// Multi-stage parse (A-1): Stage1 entities, Stage2 grounded relations.
// PRD-F P2: 텍스트는 8000자 상한 없이 청킹으로 전량 처리(파이프라인은 parse-pipeline).
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = parseRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const ctx = parsed.data;
    const isCsv = ctx.inputKind === 'csv';

    if (isCsv) {
      if (ctx.text.length > PARSE_CHAR_LIMIT_CSV) {
        return NextResponse.json(
          {
            error: `CSV 데이터가 너무 깁니다 (${ctx.text.length.toLocaleString()}자). ${PARSE_CHAR_LIMIT_CSV.toLocaleString()}자 이하로 나눠 입력해 주세요.`,
            code: 'INPUT_TOO_LARGE',
          },
          { status: 413 },
        );
      }
      const result = await runSingle(ctx, true);
      return NextResponse.json(stripEmptyWarnings(result));
    }

    // 텍스트: 단일 청크 이하는 기존 경로(회귀 없음), 초과는 청킹 경로.
    const result = needsChunking(ctx.text, SINGLE_CHUNK_CHAR_LIMIT)
      ? await runChunked(ctx)
      : await runSingle(ctx, false);
    return NextResponse.json(stripEmptyWarnings(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// warnings 가 비면 응답에서 생략(기존 응답 형태 유지).
function stripEmptyWarnings(result: {
  entities: unknown;
  relations: unknown;
  warnings: string[];
}) {
  const { warnings, ...rest } = result;
  return warnings.length > 0 ? { ...rest, warnings } : rest;
}
