import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { actionItems } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';
import {
  validateTransition,
  isResolving,
  type ActionStatus,
} from '@/lib/boards/transition';

const patchSchema = z.object({
  status: z.enum(['pending', 'in_review', 'confirmed', 'dismissed']),
  resolutionNote: z.string().max(2000).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});

// PATCH — 상태 전이(HITL). ★완전자동 금지★: confirmed/dismissed 는 행위자+사유 없이는 거부.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ontologyId, userId } = await getOntologyScope(request, 'editor');
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = await getDb();
    const item = await db.query.actionItems.findFirst({
      where: and(eq(actionItems.id, id), eq(actionItems.ontologyId, ontologyId)),
    });
    if (!item) {
      return NextResponse.json({ error: '액션 아이템을 찾을 수 없습니다.' }, { status: 404 });
    }

    const to = parsed.data.status as ActionStatus;
    const check = validateTransition({
      from: item.status as ActionStatus,
      to,
      resolvedBy: userId,
      resolutionNote: parsed.data.resolutionNote,
    });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const resolving = isResolving(to);
    const [row] = await db
      .update(actionItems)
      .set({
        status: to,
        assignedTo: parsed.data.assignedTo ?? item.assignedTo,
        resolvedBy: resolving ? userId : null,
        resolvedAt: resolving ? new Date() : null,
        resolutionNote: resolving ? (parsed.data.resolutionNote ?? null) : null,
        updatedAt: new Date(),
      })
      .where(and(eq(actionItems.id, id), eq(actionItems.ontologyId, ontologyId)))
      .returning();
    return NextResponse.json(row);
  } catch (err) {
    return handleApiError(err);
  }
}
