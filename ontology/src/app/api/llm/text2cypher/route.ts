import { NextRequest, NextResponse } from 'next/server';
import { generateText, tool, stepCountIs, zodSchema } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { getNeo4jDriver } from '@/lib/neo4j/client';
import { findWriteClauseViolation } from '@/lib/neo4j/read-only';
import { LLM_MODELS } from '@/lib/llm/models';
import { text2CypherRequestSchema } from '@/features/ontology/lib/schemas';
import { buildScopeSystemBlock, countCrossPartition } from '@/lib/neo4j/scope';
import { handleApiError } from '@/lib/api-error';

// Extract Neo4j schema for LLM context.
// 데이터 스캔(MATCH (n))만으로 스키마를 만들면 그래프가 비어 있을 때 스키마가
// 통째로 사라져 LLM 이 "스키마 없음 → 무차별 속성 스캔"으로 폴백한다. 그래서
// db.labels()/db.relationshipTypes()/db.propertyKeys() 로 라벨/관계 "계약"을
// 먼저 확보하고(빈 그래프에서도 유지됨), 데이터가 있으면 라벨별 실제 속성/관계
// 패턴을 덧붙인다.
async function getNeo4jSchema(): Promise<string> {
  const driver = getNeo4jDriver();
  const session = driver.session();

  const first = <T>(rows: { get: (k: string) => unknown }[], key: string): T[] =>
    rows.length ? ((rows[0].get(key) as T[]) ?? []) : [];

  try {
    const [labelsRes, relTypesRes, propKeysRes] = await Promise.all([
      session.run(`CALL db.labels() YIELD label RETURN collect(label) AS labels`),
      session.run(
        `CALL db.relationshipTypes() YIELD relationshipType RETURN collect(relationshipType) AS rels`,
      ),
      session.run(
        `CALL db.propertyKeys() YIELD propertyKey RETURN collect(propertyKey) AS keys`,
      ),
    ]);

    const labels = first<string>(labelsRes.records, 'labels');
    const relTypes = first<string>(relTypesRes.records, 'rels');
    const propKeys = first<string>(propKeysRes.records, 'keys');

    // 데이터가 있으면 라벨별 실제 속성 집합(빈 그래프면 0행 → 계약만 남음).
    const nodeResult = await session.run(`
      MATCH (n)
      UNWIND labels(n) AS label
      WITH label, keys(n) AS ks
      UNWIND ks AS key
      RETURN label, collect(DISTINCT key) AS properties
      ORDER BY label
    `);
    const propsByLabel = new Map<string, string[]>();
    for (const r of nodeResult.records) {
      propsByLabel.set(r.get('label') as string, (r.get('properties') as string[]) ?? []);
    }

    // 관계 패턴(있을 때만).
    const relResult = await session.run(`
      MATCH (a)-[r]->(b)
      RETURN DISTINCT labels(a)[0] AS startLabel, type(r) AS relType, labels(b)[0] AS endLabel
      ORDER BY startLabel, relType, endLabel
    `);
    const relPatterns = relResult.records.map(
      (r) =>
        `(:${r.get('startLabel')})-[:${r.get('relType')}]->(:${r.get('endLabel')})`,
    );

    const parts: string[] = [];
    parts.push('Node labels: ' + (labels.length ? labels.join(', ') : '(none)'));
    parts.push('Relationship types: ' + (relTypes.length ? relTypes.join(', ') : '(none)'));
    parts.push('Property keys: ' + (propKeys.length ? propKeys.join(', ') : '(none)'));

    if (propsByLabel.size > 0) {
      parts.push('', 'Node properties (observed):');
      for (const [label, props] of propsByLabel) {
        parts.push(`${label} {${props.join(', ')}}`);
      }
    }
    if (relPatterns.length > 0) {
      parts.push('', 'Relationship patterns (observed):');
      parts.push(...relPatterns);
    }

    return parts.join('\n');
  } finally {
    await session.close();
  }
}

// Execute a Cypher query and return results.
// H4: 프롬프트로만 "READ만"을 지시하면 환각/주입된 쓰기 절이 그대로 실행될 수 있다.
// 실행 전 쓰기 절을 차단하고(1차) Neo4j read 트랜잭션으로 실행해(2차) 이중으로 막는다.
async function executeCypherQuery(
  query: string,
  // PRD-N M2: 스코프 시 { partition } 을 바인딩한다. LLM 은 $partition 만 참조.
  params: Record<string, unknown> = {},
): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
  const violation = findWriteClauseViolation(query);
  if (violation) {
    return {
      success: false,
      error: `읽기 전용 쿼리만 실행할 수 있습니다. 금지된 절: ${violation}`,
    };
  }

  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    // executeRead 로 read 트랜잭션을 강제한다(쓰기 절은 DB 레벨에서도 거부됨).
    const result = await session.executeRead((tx) => tx.run(query, params));
    const data = result.records.map((record) => {
      const obj: Record<string, unknown> = {};
      (record.keys as string[]).forEach((key: string) => {
        const val = record.get(key);
        obj[key] =
          typeof val === 'object' && val !== null && 'toNumber' in val
            ? (val as { toNumber: () => number }).toNumber()
            : val;
      });
      return obj;
    });
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  } finally {
    await session.close();
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = text2CypherRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { question, executeQuery, maxRetries, partitionId, allPartitions } = parsed.data;
    // PRD-N M2: partitionId 지정 + 전체질의 아님 → 현재 구획으로 스코프. $partition 바인딩.
    const scoped = !!partitionId && !allPartitions;
    const execParams: Record<string, unknown> = scoped ? { partition: partitionId } : {};

    // 1. Get Neo4j schema
    let schemaText: string;
    try {
      schemaText = await getNeo4jSchema();
    } catch {
      schemaText = '(Schema unavailable - Neo4j not connected)';
    }

    // 2. Use generateText with tool calling for generate -> execute -> correct loop
    const result = await generateText({
      model: openai(LLM_MODELS.primary),
      providerOptions: { openai: { reasoningEffort: 'medium', textVerbosity: 'low' } },
      maxOutputTokens: 30000,
      system: `You are a Neo4j Cypher expert. Given a user's natural language question and a Neo4j graph schema, generate a syntactically correct Cypher query.

CRITICAL — this graph uses a META-MODEL. Read carefully:
- The ONLY node labels are: Class, Instance, RelationType (and the shared label Concept on Class/Instance).
- Domain concepts the user names (e.g. "Chamber", "Engineer", "Equipment", 한글 이름 포함) are NOT labels. They are stored as the \`name\` PROPERTY of a :Class or :Instance node.
  - WRONG: MATCH (c:Chamber) ...            ← "Chamber" label does not exist, always returns nothing.
  - RIGHT: MATCH (n) WHERE toLower(n.name) CONTAINS toLower('Chamber') ...
- Match concept nodes by \`name\` using case-insensitive, partial matching (toLower + CONTAINS) so casing/한글/부분 이름이 모두 걸린다. Use exact equality only when the user clearly wants an exact name.
- Relationship types: IS_A (class→parent), INSTANCE_OF (instance→class), plus domain relations stored as UPPER_SNAKE_CASE types (e.g. "controls" → CONTROLS). Prefer the schema's observed relationship types; when unsure, use a variable-length/any-type pattern -[r]-.

Defensive querying (avoid dropping neighbors when the anchor is not found):
- Find the anchor node first, THEN expand:
    MATCH (anchor) WHERE toLower(anchor.name) CONTAINS toLower($term)
    OPTIONAL MATCH (anchor)-[r]-(neighbor)
    RETURN anchor, r, neighbor LIMIT 50
- Do NOT make the whole result depend on a specific label or an exact name — that silently returns 0 rows when the label/name doesn't match the meta-model.

Rules:
- Only generate READ queries (MATCH, RETURN, etc.). Never generate write queries (CREATE, DELETE, SET, MERGE, etc.)
- Use the provided schema to ensure correct node labels, relationship types, and property names
- Return concise results with LIMIT when appropriate
- If the question is ambiguous, make reasonable assumptions and note them
- Respond in the same language as the user's question
- After generating a Cypher query, use the executeCypher tool to run it
- If execution fails, use the correctCypher tool to fix and re-run

Neo4j Schema:
${schemaText}${buildScopeSystemBlock(scoped ? partitionId : null)}`,
      prompt: `Generate a Cypher query for this question: "${question}"

If you generate a query, also explain what it does in plain language.`,
      tools: {
        executeCypher: tool({
          description:
            'Execute a Cypher query against Neo4j and return results.',
          inputSchema: zodSchema(z.object({
            query: z.string(),
          })),
          execute: async ({ query }: { query: string }) => {
            if (!executeQuery) {
              return { skipped: true, message: 'Query execution disabled by user', query };
            }
            return { ...await executeCypherQuery(query, execParams), query };
          },
        }),
        correctCypher: tool({
          description:
            'Fix a Cypher query that returned an error, then execute the corrected version.',
          inputSchema: zodSchema(z.object({
            originalQuery: z.string(),
            errorMessage: z.string(),
            correctedQuery: z.string(),
          })),
          execute: async ({ correctedQuery }: { correctedQuery: string }) => {
            if (!executeQuery) {
              return { skipped: true, correctedQuery };
            }
            return { ...await executeCypherQuery(correctedQuery, execParams), correctedQuery };
          },
        }),
      },
      stopWhen: stepCountIs(maxRetries + 2),
    });

    // 3. Extract results from the generation steps
    let cypherQuery = '';
    let queryResults: unknown[] | undefined;
    let executionError: string | undefined;

    // Walk through steps to find tool results
    for (const step of result.steps) {
      for (const tc of step.toolCalls) {
        const toolCall = tc as unknown as { toolName: string; input?: Record<string, string> };
        if (toolCall.toolName === 'executeCypher' || toolCall.toolName === 'correctCypher') {
          const input = toolCall.input ?? {};
          cypherQuery = input.correctedQuery ?? input.query ?? cypherQuery;
        }
      }
      for (const tr of step.toolResults) {
        const toolResult = tr as unknown as { output?: Record<string, unknown> };
        const res = toolResult.output;
        if (!res) continue;
        if (res.success && res.data) {
          queryResults = res.data as unknown[];
        }
        if (res.error) {
          executionError = res.error as string;
        }
        if (res.query) cypherQuery = res.query as string;
        if (res.correctedQuery) cypherQuery = res.correctedQuery as string;
      }
    }

    // Fallback: extract Cypher from the text response
    if (!cypherQuery) {
      const cypherMatch = result.text.match(/```(?:cypher)?\s*\n?([\s\S]*?)```/);
      if (cypherMatch) {
        cypherQuery = cypherMatch[1].trim();
      }
    }

    // PRD-N M2: 스코프 질의면 결과 내 타 구획 오염을 계량해 응답에 노출(지표·UI 경고).
    const crossPartition =
      scoped && partitionId && queryResults
        ? countCrossPartition(queryResults, partitionId)
        : undefined;

    return NextResponse.json({
      question,
      cypher: cypherQuery,
      explanation: result.text,
      executed: executeQuery,
      results: queryResults,
      error: executionError,
      scoped,
      crossPartition,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
