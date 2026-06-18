import { NextResponse } from 'next/server';
import { generateText, Output } from 'ai';
import { openai } from '@ai-sdk/openai';
import { eq } from 'drizzle-orm';
import { getDb, classes } from '@/lib/drizzle';
import { sourceRequestSchema, sourceLlmResponseSchema } from '@/features/ontology/lib/schemas';
import { maskIdentifiers } from '@/features/ontology/lib/identifier-mask';
import { webSearch, isWebSearchAvailable } from '@/features/ontology/lib/web-search';
import type { EnrichProposal } from '@/features/ontology/lib/enrich-types';

// A-4 sourcing: fill a detected gap from prioritized sources —
// internal graph → session docs → (opt-in) web → inferred. Every proposal carries
// provenance + confidence. Web is OFF by default; in-house identifiers are masked
// before any external query. Nothing is auto-applied (HITL only).
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = sourceRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { gap, context, useWeb } = parsed.data;
    const proposals: EnrichProposal[] = [];

    // 1) Internal graph — most accurate. A defined existing node answers directly.
    try {
      const db = await getDb();
      const rows = await db
        .select({ name: classes.name, description: classes.description })
        .from(classes)
        .where(eq(classes.name, gap.targetName))
        .limit(1);
      const existing = rows[0];
      if (existing?.description && existing.description.trim()) {
        proposals.push({
          kind: gap.kind,
          value: existing.description.trim(),
          sourceType: 'existing_graph',
          evidence: `기존 그래프 노드 "${existing.name}"`,
          confidence: 0.95,
          needsReview: false,
        });
      }
    } catch {
      // DB optional in some environments — fall through to LLM sourcing.
    }

    // 2) Web (opt-in only) — mask in-house identifiers before querying.
    let webSnippets: string[] = [];
    let webUsed = false;
    if (useWeb && isWebSearchAvailable()) {
      const query = maskIdentifiers(gap.targetName);
      const results = await webSearch(query, 3);
      webSnippets = results.map((r) => `${r.title}: ${r.content}`);
      webUsed = results.length > 0;
      for (const r of results) {
        proposals.push({
          kind: gap.kind,
          value: r.content.slice(0, 280),
          sourceType: 'web',
          evidence: r.url,
          confidence: 0.5,
          needsReview: true, // web always needs verification
        });
      }
    }

    // 3) LLM synthesis from session context / inference.
    try {
      const llm = await synthesize(gap, context, webSnippets);
      for (const p of llm) {
        proposals.push({
          kind: gap.kind,
          value: p.value,
          sourceType: p.sourceType,
          evidence: p.evidence,
          confidence: p.confidence,
          // Internal/inferred proposals don't need verification; web ones are
          // added separately above with needsReview = true.
          needsReview: false,
        });
      }
    } catch {
      // synthesis optional — internal/web proposals still returned
    }

    return NextResponse.json({ proposals, webUsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const KIND_GUIDANCE: Record<string, string> = {
  no_definition: 'a concise definition of the concept',
  undefined_concept: 'a concise definition of the concept',
  missing_axiom: 'a quantitative axiom — a threshold, bound, or direction constraint (e.g. "RF < X is preferred")',
  missing_property: 'one or more properties (name: dataType) the concept should have',
  low_confidence: 'a more confident type/category for the concept',
  isolated: 'a plausible grounded relation to another concept',
};

async function synthesize(
  gap: { targetName: string; kind: string; reason: string },
  context: string | undefined,
  webSnippets: string[],
) {
  const guidance = KIND_GUIDANCE[gap.kind] ?? 'an enrichment value';
  const system = `You propose an enrichment for an ontology gap. Produce ${guidance} for the target.
Rules:
- Prefer grounding in the provided session context. Mark such proposals sourceType="session_doc" with the supporting span as evidence.
- If you must reason without a source, mark sourceType="inferred" and lower the confidence.
- Do NOT fabricate in-house specifics (part numbers, equipment names). Stay domain-neutral when unsure.
- Return 0..2 proposals. Empty is fine if you have nothing grounded.`;

  const parts = [
    `Target: ${gap.targetName}`,
    `Gap: ${gap.kind} — ${gap.reason}`,
  ];
  if (context?.trim()) parts.push(`Session context:\n${context.trim()}`);
  if (webSnippets.length) parts.push(`Web snippets (treat as unverified):\n${webSnippets.join('\n')}`);

  const result = await generateText({
    model: openai('gpt-5.4'),
    providerOptions: { openai: { reasoningEffort: 'low', textVerbosity: 'low' } },
    maxOutputTokens: 4000,
    maxRetries: 1,
    output: Output.object({ schema: sourceLlmResponseSchema }),
    system,
    prompt: parts.join('\n\n'),
  });

  return result.output?.proposals ?? [];
}
