import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { patterns } from '@/lib/drizzle/schema';
import { handleApiError } from '@/lib/api-error';
import { rowToPattern } from '@/features/ontology/lib/patterns/row';
import { publishPatternRequestSchema } from '@/features/ontology/lib/patterns/types';
import { buildPublishPreview } from '@/features/ontology/lib/patterns/publish';
import { hasUnverifiedLicense } from '@/features/ontology/lib/patterns/license';

// PRD-BM-D01 (M2-2): 공유 패턴 발행.
// 게이트: 라이선스 미확인이면 acknowledge 필수(자동 발행 없음). 통과 시 민감 식별자 마스킹 적용 +
// visibility 설정 + health 산정. 지능 로직(마스킹·경고·헬스)은 전부 기구현 자산 호출.

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function POST(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  try {
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: '잘못된 패턴 id 입니다.' }, { status: 400 });
    }
    const parsed = publishPatternRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { visibility, acknowledgeLicense } = parsed.data;

    const db = await getDb();
    const existing = await db.query.patterns.findFirst({
      where: eq(patterns.id, id),
    });
    if (!existing) {
      return NextResponse.json({ error: '패턴을 찾을 수 없습니다.' }, { status: 404 });
    }

    const pattern = rowToPattern(existing);

    // 라이선스 게이트 — 미확인인데 승인 없으면 차단.
    if (hasUnverifiedLicense(pattern) && !acknowledgeLicense) {
      return NextResponse.json(
        {
          error:
            '라이선스가 확인되지 않았습니다. 출처·라이선스를 검토하고 승인해야 발행할 수 있습니다.',
          code: 'LICENSE_UNVERIFIED',
        },
        { status: 400 },
      );
    }

    // 민감 식별자 마스킹 + 헬스 산정.
    const preview = buildPublishPreview(pattern);
    const [updated] = await db
      .update(patterns)
      .set({
        roles: preview.maskedRoles,
        relationTypes: preview.maskedRelationTypes,
        competencyQuestions: preview.maskedCompetencyQuestions,
        traversalTemplates: preview.maskedTraversalTemplates,
        visibility,
        health: preview.health,
      })
      .where(eq(patterns.id, id))
      .returning();

    return NextResponse.json(rowToPattern(updated));
  } catch (err) {
    return handleApiError(err);
  }
}
