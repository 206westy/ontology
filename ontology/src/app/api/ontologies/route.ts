import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/drizzle';
import { ontologies, memberships, partitions } from '@/lib/drizzle/schema';
import { getCurrentUser } from '@/lib/supabase/auth-server';
import {
  handleApiError,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/api-error';
import { DEFAULT_WORKSPACE_ID, roleGte, type Role } from '@/lib/authz/constants';

// GET /api/ontologies — 현재 사용자가 접근 가능한(멤버십 있는) 온톨로지 목록(스위처 소스).
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    const db = await getDb();
    const rows = await db
      .select({
        id: ontologies.id,
        workspaceId: ontologies.workspaceId,
        name: ontologies.name,
        slug: ontologies.slug,
        description: ontologies.description,
        status: ontologies.status,
        createdAt: ontologies.createdAt,
      })
      .from(ontologies)
      .innerJoin(
        memberships,
        and(
          eq(memberships.workspaceId, ontologies.workspaceId),
          eq(memberships.userId, user.id),
        ),
      )
      .orderBy(ontologies.createdAt);

    return NextResponse.json(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  workspaceId: z.string().uuid().optional(),
  description: z.string().max(2000).optional(),
});

function toSlug(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = crypto.randomUUID().slice(0, 6);
  return `${base || 'onto'}-${suffix}`;
}

// POST /api/ontologies — 새 온톨로지 + 기본 구획 생성(드리프트 트리거 충족).
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const workspaceId = parsed.data.workspaceId ?? DEFAULT_WORKSPACE_ID;
    const db = await getDb();

    const [member] = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.userId, user.id),
        ),
      )
      .limit(1);
    if (!member || !roleGte(member.role as Role, 'editor')) {
      throw new ForbiddenError('이 워크스페이스에 온톨로지를 만들 권한이 없습니다.');
    }

    const [onto] = await db
      .insert(ontologies)
      .values({
        workspaceId,
        name: parsed.data.name,
        slug: toSlug(parsed.data.name),
        description: parsed.data.description ?? '',
        createdBy: user.id,
      })
      .returning();

    // 새 온톨로지의 기본 구획(class 의 소속 구획 = 온톨로지 정합 보장).
    await db
      .insert(partitions)
      .values({ ontologyId: onto.id, name: '기본 구획' });

    return NextResponse.json(onto, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
