import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getNeo4jDriver } from '@/lib/neo4j/client';
import { handleApiError } from '@/lib/api-error';

const queryRequestSchema = z.object({
  cypher: z.string().min(1),
});

// Safety: only allow read-only queries
const WRITE_KEYWORDS = /\b(CREATE|DELETE|DETACH|SET|REMOVE|MERGE|DROP|CALL\s+\{)\b/i;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = queryRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { cypher } = parsed.data;

    if (WRITE_KEYWORDS.test(cypher)) {
      return NextResponse.json(
        { error: '읽기 전용 쿼리만 허용됩니다. CREATE, DELETE, SET 등의 쓰기 명령은 사용할 수 없습니다.' },
        { status: 400 },
      );
    }

    const driver = getNeo4jDriver();
    const session = driver.session();

    try {
      const result = await session.run(cypher);
      const data = result.records.map((record) => {
        const obj: Record<string, unknown> = {};
        (record.keys as string[]).forEach((key: string) => {
          const val = record.get(key);
          obj[key] = serializeNeo4jValue(val);
        });
        return obj;
      });

      return NextResponse.json({
        success: true,
        data,
        columns: result.records.length > 0 ? (result.records[0].keys as string[]) : [],
        rowCount: data.length,
      });
    } finally {
      await session.close();
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Neo4j')) {
      return NextResponse.json(
        { error: err.message },
        { status: 502 },
      );
    }
    return handleApiError(err);
  }
}

function serializeNeo4jValue(val: unknown): unknown {
  if (val === null || val === undefined) return null;

  // Neo4j Integer
  if (typeof val === 'object' && val !== null && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }

  // Neo4j Node
  if (typeof val === 'object' && val !== null && 'labels' in val && 'properties' in val) {
    const node = val as { labels: string[]; properties: Record<string, unknown> };
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node.properties)) {
      props[k] = serializeNeo4jValue(v);
    }
    return { _labels: node.labels, ...props };
  }

  // Neo4j Relationship
  if (typeof val === 'object' && val !== null && 'type' in val && 'properties' in val && 'start' in val) {
    const rel = val as { type: string; properties: Record<string, unknown> };
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rel.properties)) {
      props[k] = serializeNeo4jValue(v);
    }
    return { _type: rel.type, ...props };
  }

  // Neo4j Path
  if (typeof val === 'object' && val !== null && 'segments' in val) {
    return String(val);
  }

  // Arrays
  if (Array.isArray(val)) {
    return val.map(serializeNeo4jValue);
  }

  return val;
}
