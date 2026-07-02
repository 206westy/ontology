// PRD-F: parse 파이프라인 코어(전송 계층과 분리). 라우트(HTTP)와 eval 스크립트가
// 같은 코드 경로를 공유하도록 NextResponse 대신 순수 결과 객체를 반환한다.
import { generateText, Output, wrapLanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { parseCacheMiddleware } from '@/lib/llm/cache-middleware';
import {
  parseStage1ResponseSchema,
  parseStage2ResponseSchema,
  type parseRequestSchema,
  type ParsedEntity,
  type ParsedRelation,
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
import { chunkText } from '@/features/ontology/lib/chunk';
import {
  mergeEntitiesAcrossChunks,
  findEmbeddingMergeCandidates,
} from '@/features/ontology/lib/entity-merge';
import { mergeRelationsAcrossChunks } from '@/features/ontology/lib/relation-merge';
import { buildEmbeddingText, embedTexts } from '@/features/ontology/lib/embedding';

export const MAX_OUTPUT_TOKENS = 16000;
export const MAX_OUTPUT_TOKENS_CSV = 32000;
// 임베딩 2차 병합 후보를 탐지할 최대 entity 수(비용 상한).
const EMBED_CANDIDATE_MAX_ENTITIES = 400;

// P1-2: 캐싱 미들웨어로 감싼 모델. 동일 입력은 LLM 재호출 없이 재현.
const parseModel = wrapLanguageModel({
  model: openai(LLM_MODELS.primary),
  middleware: parseCacheMiddleware,
});

export type ParseRequest = ReturnType<typeof parseRequestSchema.parse>;

export interface ParseResult {
  entities: ParsedEntity[];
  relations: ParsedRelation[];
  warnings: string[];
}

async function runStage1(
  ctx: ParseRequest,
  isCsv: boolean,
  maxOutputTokens: number,
): Promise<ParsedEntity[]> {
  const stage1 = await generateText({
    model: parseModel,
    providerOptions: { openai: { reasoningEffort: 'medium', textVerbosity: 'low' } },
    maxOutputTokens,
    maxRetries: LLM_MAX_RETRIES,
    output: Output.object({ schema: parseStage1ResponseSchema }),
    system: isCsv ? buildStage1SystemCsv() : buildStage1System(),
    prompt: isCsv ? buildStage1UserCsv(ctx) : buildStage1User(ctx),
  });
  return stage1.output?.entities ?? [];
}

async function runStage2(
  ctx: ParseRequest,
  entities: ParsedEntity[],
  isCsv: boolean,
  maxOutputTokens: number,
): Promise<{ relations: ParsedRelation[]; empty: boolean }> {
  const stage2 = await generateText({
    model: parseModel,
    providerOptions: { openai: { reasoningEffort: 'medium', textVerbosity: 'low' } },
    maxOutputTokens,
    maxRetries: LLM_MAX_RETRIES,
    output: Output.object({ schema: parseStage2ResponseSchema }),
    system: isCsv ? buildStage2SystemCsv() : buildStage2System(),
    prompt: buildStage2User(ctx, entities),
  });
  return { relations: stage2.output?.relations ?? [], empty: !stage2.output };
}

function relationWarnings(
  entityCount: number,
  relationCount: number,
  anyEmpty: boolean,
): string[] {
  if (entityCount < 2) return [];
  if (anyEmpty)
    return [
      '관계 추출 단계가 결과를 반환하지 못했습니다. 관계가 누락됐을 수 있으니 확인하거나 다시 시도해 주세요.',
    ];
  if (relationCount === 0)
    return [`엔티티 ${entityCount}개에서 관계를 찾지 못했습니다. 관계가 누락됐을 수 있습니다.`];
  return [];
}

// 단일 경로(텍스트 8000자 이하 또는 CSV): 기존 동작 그대로.
export async function runSingle(
  ctx: ParseRequest,
  isCsv: boolean,
): Promise<ParseResult> {
  const maxOutputTokens = isCsv ? MAX_OUTPUT_TOKENS_CSV : MAX_OUTPUT_TOKENS;
  const entities = await runStage1(ctx, isCsv, maxOutputTokens);

  let relations: ParsedRelation[] = [];
  let anyEmpty = false;
  if (entities.length >= 2) {
    const r = await runStage2(ctx, entities, isCsv, maxOutputTokens);
    relations = r.relations;
    anyEmpty = r.empty;
  }
  return {
    entities,
    relations,
    warnings: relationWarnings(entities.length, relations.length, anyEmpty),
  };
}

// 청킹 경로(P2): 상한 없이 전량 처리. Stage1 병렬 → 전역 병합 → Stage2 병렬 → 병합.
export async function runChunked(ctx: ParseRequest): Promise<ParseResult> {
  const chunks = chunkText(ctx.text);

  const perChunkEntities = await Promise.all(
    chunks.map((chunk) => runStage1({ ...ctx, text: chunk }, false, MAX_OUTPUT_TOKENS)),
  );
  const { merged: entities, mergedCount } = mergeEntitiesAcrossChunks(
    perChunkEntities.flat(),
  );

  const warnings: string[] = [
    `긴 문서를 ${chunks.length}개 청크로 나눠 전량 처리했습니다.`,
  ];
  if (mergedCount > 0)
    warnings.push(`청크 경계에서 동일 개념 ${mergedCount}건을 병합했습니다.`);

  if (entities.length >= 2 && entities.length <= EMBED_CANDIDATE_MAX_ENTITIES) {
    try {
      const vectors = await embedTexts(entities.map((e) => buildEmbeddingText(e)));
      const candidates = findEmbeddingMergeCandidates(entities, vectors);
      if (candidates.length > 0) {
        const preview = candidates
          .slice(0, 5)
          .map((c) => `"${c.a}"↔"${c.b}"`)
          .join(', ');
        warnings.push(
          `유사 개념 후보 ${candidates.length}쌍이 감지됐습니다(자동 병합 안 함, 확인 필요): ${preview}`,
        );
      }
    } catch {
      // 임베딩 실패는 치명적이지 않다 — 후보 제안만 생략.
    }
  }

  let relations: ParsedRelation[] = [];
  let anyEmpty = false;
  if (entities.length >= 2) {
    const perChunkRelations = await Promise.all(
      chunks.map((chunk) =>
        runStage2({ ...ctx, text: chunk }, entities, false, MAX_OUTPUT_TOKENS),
      ),
    );
    anyEmpty = perChunkRelations.some((r) => r.empty);
    const { merged, dedupedCount } = mergeRelationsAcrossChunks(
      perChunkRelations.flatMap((r) => r.relations),
    );
    relations = merged;
    if (dedupedCount > 0) warnings.push(`중복 관계 ${dedupedCount}건을 제거했습니다.`);
  }
  warnings.push(...relationWarnings(entities.length, relations.length, anyEmpty));

  return { entities, relations, warnings };
}
