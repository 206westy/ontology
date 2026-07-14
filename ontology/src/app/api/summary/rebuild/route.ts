import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getDb } from '@/lib/drizzle';
import { summaries, partitions, classes, relationTypes } from '@/lib/drizzle/schema';
import { getOntologyScope } from '@/lib/authz/ontologyContext';
import { handleApiError } from '@/lib/api-error';
import { embedOne } from '@/features/ontology/lib/embedding';
import { LLM_MODELS, LLM_MAX_RETRIES } from '@/lib/llm/models';
import { selectPartitionsToRebuild } from '@/lib/summary/dirty';

// PRD-PF-H M1: 구획 요약 (재)생성. dirty 구획만(전량 재계산 금지). LLM 실패 시 결정론 폴백.
const bodySchema = z.object({
  partitionId: z.string().uuid().optional(),
  force: z.boolean().optional(),
});

async function buildSummary(clsRows: { name: string; description: string | null }[], relRows: { name: string }[]): Promise<string> {
  const classText = clsRows.map((c) => `- ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n');
  const relText = relRows.map((r) => r.name).join(', ');
  const deterministic = `클래스 ${clsRows.length}종(${clsRows.slice(0, 8).map((c) => c.name).join(', ')})` + (relText ? ` · 관계: ${relText}` : '');
  if (clsRows.length === 0) return '빈 구획(개념 없음).';
  try {
    const r = await generateText({
      model: openai(LLM_MODELS.primary),
      providerOptions: { openai: { reasoningEffort: 'low', textVerbosity: 'low' } },
      maxOutputTokens: 500,
      maxRetries: LLM_MAX_RETRIES,
      system: '온톨로지 구획을 2~3문장 한국어로 요약한다. 핵심 클래스·관계·경계만. 지어내지 마라.',
      prompt: `클래스:\n${classText}\n\n관계: ${relText || '없음'}`,
    });
    return r.text?.trim() || deterministic;
  } catch {
    return deterministic; // 결정론 폴백(근거 보존)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { ontologyId } = await getOntologyScope(request, 'editor');
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const db = await getDb();

    const allParts = await db.query.partitions.findMany({
      where: eq(partitions.ontologyId, ontologyId),
    });
    const existing = await db.query.summaries.findMany({
      where: eq(summaries.ontologyId, ontologyId),
    });

    let targetIds: string[];
    if (parsed.data.partitionId) {
      targetIds = allParts.some((p) => p.id === parsed.data.partitionId) ? [parsed.data.partitionId] : [];
    } else {
      targetIds = selectPartitionsToRebuild(
        allParts.map((p) => ({ id: p.id })),
        existing.map((s) => ({ partitionId: s.partitionId, stale: s.stale })),
        { force: parsed.data.force },
      );
    }

    const rebuilt: string[] = [];
    for (const pid of targetIds) {
      const clsRows = await db.query.classes.findMany({
        where: and(eq(classes.ontologyId, ontologyId), eq(classes.partitionId, pid)),
      });
      const relRows = await db.query.relationTypes.findMany({
        where: eq(relationTypes.ontologyId, ontologyId),
      });
      const text = await buildSummary(
        clsRows.map((c) => ({ name: c.name, description: c.description })),
        relRows.map((r) => ({ name: r.name })),
      );
      let embedding: number[] | null = null;
      try {
        embedding = await embedOne(text);
      } catch {
        embedding = null;
      }
      await db
        .insert(summaries)
        .values({ ontologyId, partitionId: pid, summary: text, embedding, stale: false })
        .onConflictDoUpdate({
          target: summaries.partitionId,
          set: { summary: text, embedding, stale: false, updatedAt: new Date() },
        });
      rebuilt.push(pid);
    }

    return NextResponse.json({
      rebuilt,
      rebuiltCount: rebuilt.length,
      skipped: allParts.length - rebuilt.length,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
