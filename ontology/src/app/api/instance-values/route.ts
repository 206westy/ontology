import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { instanceValues } from '@/lib/drizzle/schema';
import { createInstanceValueSchema } from '@/features/ontology/lib/schemas';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-error';

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db.query.instanceValues.findMany();

    const result = rows.map((row) => ({
      id: row.id,
      instanceId: row.instanceId,
      propertyId: row.propertyId,
      value: row.value ?? '',
    }));

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createInstanceValueSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();

    const existing = await db.query.instanceValues.findFirst({
      where: and(
        eq(instanceValues.instanceId, parsed.data.instanceId),
        eq(instanceValues.propertyId, parsed.data.propertyId),
      ),
    });

    if (existing) {
      const [row] = await db
        .update(instanceValues)
        .set({ value: parsed.data.value ?? null })
        .where(eq(instanceValues.id, existing.id))
        .returning();

      return NextResponse.json(row);
    }

    const [row] = await db
      .insert(instanceValues)
      .values({
        instanceId: parsed.data.instanceId,
        propertyId: parsed.data.propertyId,
        value: parsed.data.value ?? null,
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

const deleteSchema = z.object({
  instanceId: z.string().uuid(),
  propertyId: z.string().uuid(),
});

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();
    const [row] = await db
      .delete(instanceValues)
      .where(
        and(
          eq(instanceValues.instanceId, parsed.data.instanceId),
          eq(instanceValues.propertyId, parsed.data.propertyId),
        ),
      )
      .returning();

    if (!row) {
      return NextResponse.json(
        { error: 'Instance value not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
