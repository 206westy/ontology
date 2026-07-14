import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { workspaces } from '@/lib/drizzle/schema';
import { getWorkspaceScope } from '@/lib/authz/getWorkspaceScope';
import { handleApiError } from '@/lib/api-error';

// PRD-PF-F M3: 도메인 모듈 토글(SPC/FDC on/off). 워크스페이스 스코프.
export async function GET(request: NextRequest) {
  try {
    const { workspaceId } = await getWorkspaceScope(request);
    const db = await getDb();
    const ws = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });
    if (!ws) {
      return NextResponse.json({ error: '워크스페이스를 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ spcEnabled: ws.spcEnabled, fdcEnabled: ws.fdcEnabled });
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({
  spcEnabled: z.boolean().optional(),
  fdcEnabled: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const { workspaceId } = await getWorkspaceScope(request, 'editor');
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const db = await getDb();
    const [row] = await db
      .update(workspaces)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning();
    return NextResponse.json({ spcEnabled: row.spcEnabled, fdcEnabled: row.fdcEnabled });
  } catch (err) {
    return handleApiError(err);
  }
}
