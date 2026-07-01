import { NextRequest, NextResponse } from 'next/server';
import { generateText, tool, stepCountIs, zodSchema } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { getNeo4jDriver } from '@/lib/neo4j/client';
import { findWriteClauseViolation } from '@/lib/neo4j/read-only';
import { LLM_MODELS } from '@/lib/llm/models';
import { text2CypherRequestSchema } from '@/features/ontology/lib/schemas';
import { handleApiError } from '@/lib/api-error';

// Extract Neo4j schema for LLM context
async function getNeo4jSchema(): Promise<string> {
  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    // Node labels and properties
    const nodeResult = await session.run(`
      MATCH (n)
      WITH DISTINCT labels(n) AS nodeLabels, keys(n) AS propKeys, n
      UNWIND nodeLabels AS label
      UNWIND propKeys AS key
      WITH label, key, n[key] AS sampleValue
      RETURN label, collect(DISTINCT key) AS properties
      ORDER BY label
    `);

    const nodes = nodeResult.records.map((r) => {
      const label = r.get('label');
      const props = r.get('properties') as string[];
      return `${label} {${props.join(', ')}}`;
    });

    // Relationship types and directions
    const relResult = await session.run(`
      MATCH (a)-[r]->(b)
      RETURN DISTINCT labels(a)[0] AS startLabel, type(r) AS relType, labels(b)[0] AS endLabel
      ORDER BY startLabel, relType, endLabel
    `);

    const rels = relResult.records.map(
      (r) =>
        `(:${r.get('startLabel')})-[:${r.get('relType')}]->(:${r.get('endLabel')})`,
    );

    const parts = ['Node properties:'];
    parts.push(...nodes);
    parts.push('', 'Relationships:');
    parts.push(...rels);

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
    const result = await session.executeRead((tx) => tx.run(query));
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

    const { question, executeQuery, maxRetries } = parsed.data;

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

Rules:
- Only generate READ queries (MATCH, RETURN, etc.). Never generate write queries (CREATE, DELETE, SET, MERGE, etc.)
- Use the provided schema to ensure correct node labels, relationship types, and property names
- Return concise results with LIMIT when appropriate
- If the question is ambiguous, make reasonable assumptions and note them
- Respond in the same language as the user's question
- After generating a Cypher query, use the executeCypher tool to run it
- If execution fails, use the correctCypher tool to fix and re-run

Neo4j Schema:
${schemaText}`,
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
            return { ...await executeCypherQuery(query), query };
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
            return { ...await executeCypherQuery(correctedQuery), correctedQuery };
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

    return NextResponse.json({
      question,
      cypher: cypherQuery,
      explanation: result.text,
      executed: executeQuery,
      results: queryResults,
      error: executionError,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
