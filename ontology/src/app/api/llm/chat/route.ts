import { NextRequest } from 'next/server';
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, context } = body as {
      messages: UIMessage[];
      context?: {
        selectedNodeIds?: string[];
        selectedNodeType?: string;
        ontologySummary?: string;
      };
    };

    const contextParts: string[] = [];
    if (context?.ontologySummary) {
      contextParts.push(`Current ontology summary:\n${context.ontologySummary}`);
    }
    if (context?.selectedNodeIds?.length) {
      contextParts.push(
        `Selected nodes (${context.selectedNodeType ?? 'unknown'}): ${context.selectedNodeIds.join(', ')}`,
      );
    }

    const systemPrompt = `You are an ontology design assistant for Ontology Studio. You help domain experts build and refine ontologies.

Your capabilities:
- Suggest class hierarchies, properties, and relationships
- Explain ontology design patterns (is-a, has-a, part-of)
- Identify potential issues (redundancy, missing relationships, naming inconsistencies)
- Help with OWL/RDF concepts in plain language
- Answer questions about the current ontology structure

Guidelines:
- Respond in the same language as the user (Korean if Korean, English if English)
- Be concise and actionable
- When suggesting changes, describe them in terms the user can apply in the graph editor
- If the user's request is ambiguous, ask clarifying questions

${contextParts.length > 0 ? `\nCurrent context:\n${contextParts.join('\n\n')}` : ''}`;

    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages: modelMessages,
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
