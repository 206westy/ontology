import { NextResponse } from 'next/server';
import { generateText, Output } from 'ai';
import { openai } from '@ai-sdk/openai';
import {
  detectRequestSchema,
  llmGapResponseSchema,
} from '@/features/ontology/lib/schemas';
import {
  detectDeterministicGaps,
  mergeGaps,
  type DetectSubgraph,
} from '@/features/ontology/lib/gap-detector';
import type { Gap } from '@/features/ontology/lib/enrich-types';

// A-3 gap detection: deterministic scan (fast, no LLM) + an LLM qualitative scan
// for gaps that need judgement (missing quantitative axioms, low type confidence,
// selectively undefined concepts). The gap count is NOT fixed — it varies with the
// actual subgraph. Detection only proposes; nothing is applied.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = detectRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const subgraph = parsed.data.subgraph as DetectSubgraph;
    const deterministic = detectDeterministicGaps(subgraph);

    let llmGaps: Gap[] = [];
    try {
      llmGaps = await detectQualitativeGaps(subgraph);
    } catch {
      // The deterministic gaps are still valuable if the LLM pass fails.
      llmGaps = [];
    }

    const gaps = mergeGaps(deterministic, llmGaps);
    return NextResponse.json({ gaps });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function detectQualitativeGaps(subgraph: DetectSubgraph): Promise<Gap[]> {
  const nodeLines = subgraph.nodes
    .map((n) => {
      const def = n.description?.trim() ? `def: ${n.description.trim()}` : 'no definition';
      const ev = n.evidence?.trim() ? `evidence: ${n.evidence.trim()}` : 'no evidence';
      return `- ${n.name}${n.type ? ` (type: ${n.type})` : ''} — ${def}; ${ev}`;
    })
    .join('\n');
  const relLines = subgraph.relations
    .map((r) => `- ${r.source} —[${r.type}]→ ${r.target}${r.confidence != null ? ` (conf ${r.confidence})` : ''}`)
    .join('\n');

  const system = `You inspect a small ontology subgraph and report ONLY qualitative gaps that need enrichment. Allowed kinds:
- missing_axiom: a relation/statement is qualitative ("the lower the better") but lacks a quantitative axiom — a threshold, bound, or direction constraint.
- low_confidence: an entity's type/categorization seems uncertain or likely wrong.
- no_definition: a node genuinely needs a definition (do NOT flag nodes that are obviously self-explanatory — keep false positives low).

Do NOT report isolation or undefined-reference gaps — those are handled separately. Report only what truly needs enrichment. The number of gaps is not fixed; return an empty list if nothing qualifies.`;

  const user = `Nodes:\n${nodeLines || '(none)'}\n\nRelations:\n${relLines || '(none)'}`;

  const result = await generateText({
    model: openai('gpt-5.4'),
    providerOptions: { openai: { reasoningEffort: 'low', textVerbosity: 'low' } },
    maxOutputTokens: 8000,
    maxRetries: 1,
    output: Output.object({ schema: llmGapResponseSchema }),
    system,
    prompt: user,
  });

  return result.output?.gaps ?? [];
}
