import { NextResponse } from 'next/server';
import { generateText, Output } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const ParsedOntology = z.object({
  classes: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      color: z.string().nullable(),
      parentName: z.string().nullable(),
    }),
  ),
  properties: z.array(
    z.object({
      className: z.string(),
      name: z.string(),
      dataType: z.enum(['string', 'integer', 'float', 'boolean', 'date', 'enum']),
      isRequired: z.boolean(),
      enumValues: z.array(z.string()).nullable(),
    }),
  ),
  instances: z.array(
    z.object({
      className: z.string(),
      name: z.string(),
    }),
  ),
  relations: z.array(
    z.object({
      sourceName: z.string(),
      targetName: z.string(),
      relationName: z.string(),
    }),
  ),
});

export type ParsedOntologyOutput = z.infer<typeof ParsedOntology>;

const requestSchema = z.object({
  text: z.string().min(1),
  existingClasses: z.array(z.string()).optional(),
  existingRelationTypes: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { text, existingClasses, existingRelationTypes } = parsed.data;

    const systemPrompt = `You are an ontology expert. Given free-form text about a domain, extract structured ontology elements.

Rules:
- Extract classes (categories/types), properties (attributes), instances (specific examples), and relations (connections between classes).
- If existing classes are provided, reuse them instead of creating duplicates.
- If existing relation types are provided, reuse them when appropriate.
- For colors: root/important=#7c3aed, mid-level=#2563eb, leaf=#0891b2, person=#d97706, place=#dc2626, event=#db2777
- Do NOT create parent-child (is-a) relationships unless the text explicitly states one class IS A subtype/subclass of another. "Equipment A and Equipment B exist" does NOT mean one is a subclass of the other.
- Be thorough but don't hallucinate — only extract what's clearly stated or strongly implied.
- Respond in the same language as the input text.`;

    const userPrompt = `Extract ontology from this text:
"""
${text}
"""

${existingClasses?.length ? `Existing classes (reuse if relevant): ${existingClasses.join(', ')}` : ''}
${existingRelationTypes?.length ? `Existing relation types (reuse if relevant): ${existingRelationTypes.join(', ')}` : ''}`;

    const result = await generateText({
      model: openai('gpt-5.4-mini'),
      output: Output.object({ schema: ParsedOntology }),
      system: systemPrompt,
      prompt: userPrompt,
    });

    if (!result.output) {
      return NextResponse.json(
        { error: 'Empty response from LLM' },
        { status: 500 },
      );
    }

    return NextResponse.json(result.output);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
