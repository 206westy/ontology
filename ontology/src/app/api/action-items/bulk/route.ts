import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { actionItems } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';
import { validateTransition, type ActionStatus } from '@/lib/boards/transition';

// 일괄 처리 상한(감사 품질 보호 — PRD §8 열린결정, 보수적으로 50).
const BULK_MAX = 50;

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(BULK_MAX),
  action: z.enum(['confirm', 'dismiss']),
  note: z.string().min(1).max(2000),
});

// POST — 일괄 확정/기각. 공통 사유 1개 필수(감사추적 공백 금지). 허용되지 않은 전이는 skip.
export async function POST(request: NextRequest) {
  try {
    const { ontologyId, userId } = await getOntologyScope(request, 'editor');
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const to: ActionStatus = parsed.data.action === 'confirm' ? 'confirmed' : 'dismissed';

    const db = await getDb();
    const items = await db.query.actionItems.findMany({
      where: and(
        eq(actionItems.ontologyId, ontologyId),
        inArray(actionItems.id, parsed.data.ids),
      ),
    });

    const updatable = items.filter(
      (it) =>
        validateTransition({
          from: it.status as ActionStatus,
          to,
          resolvedBy: userId,
          resolutionNote: parsed.data.note,
        }).ok,
    );
    const updatedIds = updatable.map((it) => it.id);

    if (updatedIds.length > 0) {
      await db
        .update(actionItems)
        .set({
          status: to,
          resolvedBy: userId,
          resolvedAt: new Date(),
          resolutionNote: parsed.data.note,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(actionItems.ontologyId, ontologyId),
            inArray(actionItems.id, updatedIds),
          ),
        );
    }

    return NextResponse.json({
      updated: updatedIds.length,
      skipped: parsed.data.ids.length - updatedIds.length,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
