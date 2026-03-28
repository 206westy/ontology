import { NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// ── Rate limiter: max 3 requests per minute (in-memory) ──────
const rateBucket = { count: 0, resetAt: 0 };

function checkRateLimit(): boolean {
  const now = Date.now();
  if (now > rateBucket.resetAt) {
    rateBucket.count = 0;
    rateBucket.resetAt = now + 60_000;
  }
  if (rateBucket.count >= 3) return false;
  rateBucket.count++;
  return true;
}

// ── Request / Response schemas ────────────────────────────────

const schemaContextSchema = z.object({
  classHierarchy: z.string(),
  propertyMap: z.string(),
  relationTypes: z.string(),
  statistics: z.string(),
});

const requestSchema = z.object({
  type: z.enum(['class', 'property', 'relation']),
  context: schemaContextSchema,
  currentInput: z.string(),
  extra: z.record(z.string(), z.string()).optional(),
});

const classSuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      name: z.string().describe('Suggested class name'),
      description: z.string().describe('Brief description'),
      reason: z.string().describe('Why this is a good suggestion'),
    }),
  ).max(5),
});

const propertySuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      name: z.string().describe('Property name'),
      dataType: z.enum(['string', 'integer', 'float', 'boolean', 'date', 'enum']),
      isRequired: z.boolean(),
      reason: z.string().describe('Why this property is needed'),
    }),
  ).max(5),
});

const relationSuggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      name: z.string().describe('Relation name'),
      description: z.string().describe('What this relation represents'),
      reason: z.string().describe('Why this relation is appropriate'),
    }),
  ).max(5),
});

// ── Prompt builders ──────────────────────────────────────────

function buildClassPrompt(
  context: z.infer<typeof schemaContextSchema>,
  currentInput: string,
  extra?: Record<string, string>,
): string {
  const parentName = extra?.parentClassName ?? '';
  return `You are an ontology design assistant. Based on the current ontology, suggest 3 new subclasses.

Current ontology hierarchy:
${context.classHierarchy}

Property map:
${context.propertyMap}

Statistics:
${context.statistics}

${parentName ? `Parent class: ${parentName}` : 'No parent class specified (root-level)'}
${currentInput ? `User is typing: "${currentInput}"` : ''}

Suggest 3 subclasses that would logically extend this ontology. Consider sibling patterns and domain conventions.
Respond in Korean if the existing class names are in Korean.`;
}

function buildPropertyPrompt(
  context: z.infer<typeof schemaContextSchema>,
  currentInput: string,
  extra?: Record<string, string>,
): string {
  const className = extra?.className ?? '';
  const classDescription = extra?.classDescription ?? '';
  const existingProps = extra?.existingProperties ?? '';
  return `You are an ontology design assistant. Suggest missing properties for a class.

Current ontology:
${context.classHierarchy}

All property definitions:
${context.propertyMap}

Target class: ${className}
${classDescription ? `Description: ${classDescription}` : ''}
Existing properties of this class: ${existingProps || '(none)'}
${currentInput ? `User is typing: "${currentInput}"` : ''}

Suggest up to 5 properties that this class is likely missing. Consider common patterns from similar domains and sibling classes.
Respond in Korean if the existing names are in Korean.`;
}

function buildRelationPrompt(
  context: z.infer<typeof schemaContextSchema>,
  currentInput: string,
  extra?: Record<string, string>,
): string {
  const sourceName = extra?.sourceName ?? '';
  const targetName = extra?.targetName ?? '';
  return `You are an ontology design assistant. Suggest appropriate relations between two classes.

Current ontology:
${context.classHierarchy}

Existing relations:
${context.relationTypes}

Source: ${sourceName}
Target: ${targetName}
${currentInput ? `User is typing: "${currentInput}"` : ''}

Suggest up to 5 relation types that would make sense between these two classes. Consider domain conventions and existing patterns.
Respond in Korean if the existing names are in Korean.`;
}

// ── Route handler ────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    if (!checkRateLimit()) {
      return NextResponse.json(
        { error: 'AI 추천 요청 한도를 초과했습니다. 1분 후 다시 시도해주세요.' },
        { status: 429 },
      );
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { type, context, currentInput, extra } = parsed.data;

    let result;

    switch (type) {
      case 'class': {
        result = await generateObject({
          model: openai('gpt-5.4-mini'),
          schema: classSuggestionSchema,
          prompt: buildClassPrompt(context, currentInput, extra),
        });
        break;
      }
      case 'property': {
        result = await generateObject({
          model: openai('gpt-5.4-mini'),
          schema: propertySuggestionSchema,
          prompt: buildPropertyPrompt(context, currentInput, extra),
        });
        break;
      }
      case 'relation': {
        result = await generateObject({
          model: openai('gpt-5.4-mini'),
          schema: relationSuggestionSchema,
          prompt: buildRelationPrompt(context, currentInput, extra),
        });
        break;
      }
    }

    return NextResponse.json({
      type,
      ...result.object,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
