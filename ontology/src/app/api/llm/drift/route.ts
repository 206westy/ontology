import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-error';
import { driftRequestSchema } from '@/features/ontology/lib/patterns/drift';
import { judgeDriftBatchWithLlm } from '@/features/ontology/lib/patterns/drift-llm';

// PRD-H (H5/M4): 스키마 드리프트 판정 엔드포인트. 패턴 밖 신규 요소를 3분기(매핑/확장/분기)로
// 판정한다(primary). 이 라우트는 패턴·구획을 변경하지 않는다 — 판정만 돌려주고, 반영(확장 승격·
// 분기 발견·브릿지)은 컨펌 시 별도 엔드포인트가 수행한다.
export async function POST(request: NextRequest) {
  try {
    const parsed = driftRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { domain, roles, relationTypes, elements } = parsed.data;

    const judgments = await judgeDriftBatchWithLlm(elements, {
      domain,
      roles,
      relationTypes,
    });

    return NextResponse.json({ judgments });
  } catch (err) {
    return handleApiError(err);
  }
}
