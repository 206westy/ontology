import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { classes, instances } from '@/lib/drizzle/schema';
import { eq, isNull } from 'drizzle-orm';
import { buildEmbeddingText, embedTexts } from '@/features/ontology/lib/embedding';
import { handleApiError } from '@/lib/api-error';

// PRD-E P2-2: 임베딩 생성 워커. embedding IS NULL 인 노드를 배치로 채운다.
// 커밋 후 fire-and-forget 트리거 + 최초 백필(remaining=0 까지 반복).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit ?? 100), 1), 500);

    const db = await getDb();
    let updated = 0;

    // 1) 클래스
    const clsRows = await db
      .select({
        id: classes.id,
        name: classes.name,
        description: classes.description,
      })
      .from(classes)
      .where(isNull(classes.embedding))
      .limit(limit);

    if (clsRows.length > 0) {
      const embeddings = await embedTexts(clsRows.map((c) => buildEmbeddingText(c)));
      for (let i = 0; i < clsRows.length; i++) {
        await db
          .update(classes)
          .set({ embedding: embeddings[i] })
          .where(eq(classes.id, clsRows[i].id));
      }
      updated += clsRows.length;
    }

    // 2) 인스턴스
    const instRows = await db
      .select({
        id: instances.id,
        name: instances.name,
        description: instances.description,
      })
      .from(instances)
      .where(isNull(instances.embedding))
      .limit(limit);

    if (instRows.length > 0) {
      const embeddings = await embedTexts(instRows.map((i) => buildEmbeddingText(i)));
      for (let i = 0; i < instRows.length; i++) {
        await db
          .update(instances)
          .set({ embedding: embeddings[i] })
          .where(eq(instances.id, instRows[i].id));
      }
      updated += instRows.length;
    }

    // 3) 남은 개수
    const [remainingClasses, remainingInstances] = await Promise.all([
      db.$count(classes, isNull(classes.embedding)),
      db.$count(instances, isNull(instances.embedding)),
    ]);
    const remaining = Number(remainingClasses) + Number(remainingInstances);

    return NextResponse.json({ updated, remaining });
  } catch (err) {
    return handleApiError(err);
  }
}
