import type { ParsedEntity } from './schemas';

// Multi-stage parse prompts (A-1). Extraction (points) is split from connection
// (lines) into two focused LLM calls. The hard rules below exist to kill the
// "document title as hub" star pattern and to allow honest islands.

interface PromptContext {
  text: string;
  existingClasses?: string[];
  existingRelationTypes?: string[];
  // Enriched schema context (hierarchy + types + key relations) for node reuse (A-2).
  existingSchema?: string;
}

const SHARED_RULES = `Hard rules:
- Do NOT use the document's title, heading, or overall subject as a parent or hub. A node must never be attached to another node merely because both appear in the same document.
- Only extract what is explicitly stated or strongly implied by the text. Do not hallucinate.
- Do NOT merge concepts that share a similar name but are a different kind of thing. For example a part "Chuck" and a parameter "Chuck temperature" are two distinct concepts — keep them separate.
- Respond in the same language as the input text for all names and evidence.`;

export function buildStage1System(): string {
  return `You are an ontology entity extractor. Given free-form domain text, extract the distinct entities (the "points" of the graph) — concrete concepts, components, parameters, materials, measurements, events.

For each entity provide:
- name: the concept's name as it appears in the text.
- type: a category/class for the entity (e.g. hardware, process parameter, material). Reuse an existing class name when one clearly fits; otherwise propose a concise new type. The type must be a genuine category, never the document title/subject.
- nodeKind: "class" or "instance" (see classification rules below).
- parentType: for instances, the owning class name (must match a class entity's name in this extraction, or an existing class). null for classes.
- evidence: a short verbatim span from the source text that supports this entity.
- properties: for instances, the concrete property values it has, each as { name, value, dataType }. Empty array for classes.

Classification rules:
- A noun that denotes a CATEGORY or KIND that subsumes other things → nodeKind "class" (e.g. 공정 파라미터, 하드웨어 부품, 이슈).
- A specific object, proper noun, model name, or anything that HAS property values (part numbers, etc.) → nodeKind "instance", and put its owning category in parentType (e.g. Chuck → 하드웨어 부품, RF Bias → 공정 파라미터, Descum 3호기 → 호기).
- Property DEFINITIONS (e.g. partNumber: string) belong to the class; the actual VALUE (e.g. KC0330655) belongs to the instance — put it in that instance's properties as { name: "partNumber", value: "KC0330655", dataType: "string" }.
- When unsure, classify as "class" (conservative); the user can switch it later.

Do NOT extract relations in this stage.

${SHARED_RULES}`;
}

export function buildStage1User(ctx: PromptContext): string {
  const parts = [
    `Extract entities from this text:\n"""\n${ctx.text}\n"""`,
  ];
  if (ctx.existingSchema) {
    parts.push(
      `Existing ontology (reuse these classes as types when an entity matches, and reuse a node instead of inventing a duplicate):\n${ctx.existingSchema}`,
    );
  } else if (ctx.existingClasses?.length) {
    parts.push(
      `Existing classes (reuse as types when relevant): ${ctx.existingClasses.join(', ')}`,
    );
  }
  return parts.join('\n\n');
}

export function buildStage2System(): string {
  return `You are an ontology relation extractor. You are given a list of already-extracted entities and the original text. Extract ONLY relations that have explicit or strongly-implied grounding in the text.

Valid grounding includes: causal ("A increases B"), compositional ("A contains B"), temporal/sequence ("A precedes B"), measurement ("A is measured by B"), replacement/maintenance history, or a clearly stated dependency.

For each relation provide:
- source, target: entity names (prefer names from the provided entity list; you may reference a concept the text clearly relates even if it was not listed).
- type: a concise relation/verb name describing the connection.
- evidence: the verbatim span that grounds the relation.
- confidence: 0..1, how strongly the text supports this relation.

${SHARED_RULES}
- Co-occurrence is NOT grounding. If two entities merely appear together with no stated connection, do NOT relate them.
- If an entity has no grounded relation, leave it unconnected. Honest islands are better than forced edges — return fewer, well-grounded relations.`;
}

export function buildStage2User(ctx: PromptContext, entities: ParsedEntity[]): string {
  const entityList = entities
    .map((e) => `- ${e.name} (${e.type})`)
    .join('\n');
  const parts = [
    `Entities:\n${entityList || '(none)'}`,
    `Original text:\n"""\n${ctx.text}\n"""`,
  ];
  if (ctx.existingRelationTypes?.length) {
    parts.push(
      `Existing relation types (reuse when appropriate): ${ctx.existingRelationTypes.join(', ')}`,
    );
  }
  return parts.join('\n\n');
}
