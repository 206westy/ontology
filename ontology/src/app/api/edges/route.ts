import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { edges } from '@/lib/drizzle/schema';
import { createEdgeSchema } from '@/features/ontology/lib/schemas';
import { eq, or } from 'drizzle-orm';
import { handleApiError } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  const nodeId = request.nextUrl.searchParams.get('nodeId');

  try {
    const db = await getDb();
    const rows = nodeId
      ? await db.query.edges.findMany({
          where: or(eq(edges.sourceId, nodeId), eq(edges.targetId, nodeId)),
          with: { relationType: true },
        })
      : await db.query.edges.findMany({
          with: { relationType: true },
        });

    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createEdgeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();
    const [row] = await db
      .insert(edges)
      .values({
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        relationTypeId: parsed.data.relationTypeId,
        sourceId: parsed.data.sourceId,
        targetId: parsed.data.targetId,
        sourceKind: parsed.data.sourceKind,
        targetKind: parsed.data.targetKind,
        isBridge: parsed.data.isBridge ?? false,
        sourceType: parsed.data.sourceType ?? null,
        confidence: parsed.data.confidence ?? null,
        evidence: parsed.data.evidence ?? null,
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'id query parameter is required' },
      { status: 400 },
    );
  }

  try {
    const db = await getDb();
    const [row] = await db
      .delete(edges)
      .where(eq(edges.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Edge not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
