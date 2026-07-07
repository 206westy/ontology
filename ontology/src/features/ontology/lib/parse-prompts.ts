import type { ParsedEntity, ParsePatternContext } from './schemas';

// Multi-stage parse prompts (A-1). Extraction (points) is split from connection
// (lines) into two focused LLM calls. The hard rules below exist to kill the
// "document title as hub" star pattern and to allow honest islands.

interface PromptContext {
  text: string;
  existingClasses?: string[];
  existingRelationTypes?: string[];
  // Enriched schema context (hierarchy + types + key relations) for node reuse (A-2).
  existingSchema?: string;
  // PRD-H H3 (M2): confirmed 패턴 시드. 있으면 역할/관계로 추출을 유도한다.
  patternContext?: ParsePatternContext;
}

// PRD-H H3: Stage1 역할 블록 — 추출된 엔티티의 type 을 패턴 역할로 강제한다.
// 순수 함수(단위 테스트 대상). patternContext 없으면 호출부에서 아예 붙지 않는다.
export function buildStage1PatternBlock(pc: ParsePatternContext): string {
  const roleLines = pc.roles
    .map((r) => `- ${r.name}: ${r.description || '(역할 설명 없음)'}`)
    .join('\n');
  return `Domain pattern context (도메인 "${pc.domain}") — 이 입력은 이미 이 패턴으로 확정되었습니다. 각 엔티티의 "type"(역할)을 아래 ROLE 이름 중 하나로 배정하세요. 새로운 최상위 타입을 지어내지 말고, 텍스트의 개념을 가장 가까운 역할로 분류합니다.
Roles(역할):
${roleLines}
모든 엔티티는 위 역할 중 하나에 매핑되어야 합니다(매핑 불가한 개념은 추출하지 마세요).`;
}

// PRD-H H3: Stage2 관계 블록 — 패턴 관계 타입을 우선 예측하고 인과 계층(chain)을
// 만들도록 유도한다(깊이 1 평면 목록 금지: 예 증상→원인→점검→조치).
export function buildStage2PatternBlock(pc: ParsePatternContext): string {
  const relLines = pc.relationTypes
    .map((rt) => `- ${rt.name} (${rt.layer}): ${rt.sourceRole} → ${rt.targetRole}`)
    .join('\n');
  const cqLines = pc.competencyQuestions.map((q) => `- ${q}`).join('\n');
  const parts = [
    `Domain pattern relations (도메인 "${pc.domain}") — 아래 패턴 관계 타입을 우선적으로 사용하세요. 결과는 반드시 CAUSAL HIERARCHY(인과 계층 체인)를 이뤄야 합니다 — 문서 제목이나 한 허브에 모두 매다는 깊이 1 평면 목록은 금지입니다. 역할들을 체인으로 연결하세요(예: 증상 → 원인 → 점검 → 조치).`,
    `Pattern relation types(관계 타입):\n${relLines}`,
  ];
  if (cqLines) {
    parts.push(`Competency questions(이 관계들이 답해야 하는 질문):\n${cqLines}`);
  }
  return parts.join('\n');
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
- type: the immediate parent this entity sits directly under in the hierarchy.
    • instance → the class it is an instance of.
    • class → its DIRECT SUPERCLASS, but ONLY when the text states a kind-of / is-a / membership relationship to a NAMED concept (e.g. "A is a kind of B", "B에는 A, C가 있다", "A는 B의 한 종류/종이다"). Use that named concept exactly as written.
    • class with no stated parent (a top-level concept) → set type to null.
  CRITICAL — never invent an abstract grouping label. Turning a stated parent into a fabricated category is WRONG: "차량"→"차량 종류", "동물"→"동물 분류", "X"→"X category"/"X type". Use the real named concept verbatim, or null. The type must never be the document title/subject. Reuse an existing class name when one clearly fits.
- nodeKind: "class" or "instance" (see classification rules below).
- parentType: for instances, the owning class name (must match a class entity's name in this extraction, or an existing class). null for classes.
- evidence: a short verbatim span from the source text that supports this entity.
- description: a one-line definition of the entity, ONLY if the source text actually defines or describes what it is. If the text merely mentions the name without explaining it, return null. Never invent a definition.
- properties: for instances, the concrete property values it has, each as { name, value, dataType, enumValues }. enumValues is the list of allowed values for an enum property (dataType "enum"); use null for every non-enum property.

Operating modes, states, and options rule:
- An entity's operating MODE, STATE, or selectable OPTION (e.g. "RAG 모드"/"Agent 모드", "가동"/"정지", "Auto"/"Manual") is NOT a separate node. It is an enum property value of the entity it belongs to.
- Emit it as a property on that instance: { name: "mode", value: "RAG", dataType: "enum", enumValues: ["RAG", "Agent"] }. Do not create a class or instance for the mode itself.

Classification rules — the decisive test is SCHEMA vs DATA: does this entity DEFINE/NARROW what comes below it (class), or does it FILL property slots with concrete values (instance)? Having relations does NOT make something a class — instances have relations too, often the most.
- INSTANCE: a concrete record that fills property slots with actual VALUES — a serial/part number, a proper noun, a specific thing existing at a point in time or place (e.g. "SUPRA-XPe-SN-00472", Chuck with partNumber KC0330655, "Descum 3호기"). You count these as "how many", and they are leaves (do not split into further kinds). Put its owning class in type and its values in properties.
- CLASS: a template/category that DEFINES or NARROWS the properties, relations, or constraints of the things under it (e.g. 공정 파라미터, 하드웨어 부품). You count these as "how many KINDS", and they can split into further kinds.
- SUBCLASS only when structurally justified: make a class a subclass of another ONLY if its properties, relations, or constraints differ STRUCTURALLY from the parent (extra components, a different procedure, different causal/procedural relations). If candidate children differ ONLY by an attribute value (e.g. just a different model-name string), they are NOT subclasses — model that attribute as a property and the things as instances. Keep hierarchies shallow; deep subclass trees are usually over-modeling.
- DEFAULT WHEN UNSURE → instance. An instance is the safe default; a subclass is a choice that must be justified by structural difference.
- Property DEFINITIONS (e.g. partNumber: string) live on the class; the actual VALUE (e.g. KC0330655) lives on the instance — put it in that instance's properties as { name: "partNumber", value: "KC0330655", dataType: "string" }.
- An ATTRIBUTE or MEASUREMENT of an entity (its weight, rated power, age, temperature, part number, etc.) is a PROPERTY of that entity — NEVER its own class or instance node. Do not emit a separate entity for the attribute NAME (무게, 정격 출력, 나이) nor for its VALUE (999그램, 5kW, 5살). Attach it to the owning instance's properties instead.

Hierarchy rules:
- When the text says one concept is a kind/type/subclass of another, or lists members of a category ("D에는 A, B가 있다", "A·B는 D의 한 종류이다", "D includes A and B"), the listed concepts are CLASSES whose type (superclass) is D — UNLESS a listed item is a concrete individual, or differs from its siblings only by an attribute value; then it is an instance or a property value, per the classification rules above. Build the chain to as many levels as the text genuinely supports (a class can be the parent of other classes), but do not invent levels.
- A subclass is itself a kind that can have its own members or instances. A single concrete individual (a specific named thing, usually with property values) is an INSTANCE — not a subclass.
- Capture the kind-of link in the child's "type" field EVEN when the sentence uses listing/containment wording to enumerate kinds ("D에는 A, B가 있다", "D의 한 종류로 A가 있다", "D는 A·B로 나뉜다", "D consists of kinds A, B"). Here A.type = D. Taxonomy lives in "type", NOT in a separate relation.
- Distinguish taxonomy from physical part-of: "장비는 척과 모터로 구성된다"(a device is physically made of a chuck and a motor) is part-of composition, not subclassing — those parts are their own classes/instances, not subclasses of the device. Only a kind-of/종류/일종 statement sets the "type" to the parent.
- This is a general rule, not tied to any one domain: apply it to whatever kind-of / membership statements the text actually contains.

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
  if (ctx.patternContext) {
    parts.push(buildStage1PatternBlock(ctx.patternContext));
  }
  return parts.join('\n\n');
}

export function buildStage2System(): string {
  return `You are an ontology relation extractor. You are given a list of already-extracted entities and the original text. Extract ONLY relations that have explicit or strongly-implied grounding in the text.

Valid grounding includes: causal ("A increases B"), compositional ("A contains B"), temporal/sequence ("A precedes B"), measurement ("A is measured by B"), replacement/maintenance history, or a clearly stated dependency.

For each relation provide:
- source, target: entity names (prefer names from the provided entity list; you may reference a concept the text clearly relates even if it was not listed).
- type: a concise relation/verb name describing the connection. Keep the verb general — do NOT bake the object into the predicate. "끌어와 답한다" is good; "예측을 끌어와 답한다" is bad (the object 예측 is the target, not part of the type).
- layer: classify as exactly one — "semantic" (the relation states knowledge: composition, containment, location, causation, description — what IS) or "kinetic" (the relation is an action to perform: inspect, check, replace, execute, a procedure or response — what to DO).
- evidence: the verbatim span that grounds the relation.
- confidence: 0..1, how strongly the text supports this relation EXISTING.

${SHARED_RULES}
- Co-occurrence is NOT grounding. If two entities merely appear together with no stated connection, do NOT relate them.
- A DEFINITION is NOT a relation. "X is a platform for Y" / "X is a kind of Y" should become an isA hierarchy (parentType) or the node's description — NOT an edge. Do not emit a relation for it.
- TAXONOMY IS NOT A "contains"/"includes" RELATION. A kind-of / 종류 / 일종 listing ("D에는 A, B가 있다", "D의 한 종류로 A가 있다") is hierarchy and was already captured in the entity type — do NOT emit a contains/includes/포함 structural edge for it. Reserve "structural contains" for PHYSICAL part-of composition (a device physically contains a part), never for type taxonomy.
- AN ATTRIBUTE VALUE IS NOT A RELATION. Do NOT emit a relation that merely restates an entity's own attribute/measurement ("X의 무게는 999g", "X의 정격 출력은 5kW", "X는 5살이다", "X의 part number는 KC033"). These are property values of X — already captured in stage 1 — not relations. A relation must connect two DISTINCT real entities; never connect an entity to one of its own attributes, to a literal number, or to a measurement/unit.
- Hierarchy, parallel, ordering-by-layout, and pure layout statements ("A and B are parallel", "A is listed next to B", "A is in the left column") are weak and usually not worth emitting — prefer leaving them out.
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
  if (ctx.patternContext) {
    parts.push(buildStage2PatternBlock(ctx.patternContext));
  }
  return parts.join('\n\n');
}

// ─── CSV mode (M5) ──────────────────────────────────────────
// Tabular input is structurally different from prose: the header row IS the
// schema and each data row IS a record. These builders teach the same two-stage
// extractor (and the SAME output schema) to read a table — describing the data
// itself (one object type + typed columns + row instances) AND the structural
// insight it encodes (reference columns → linked entities, categorical columns
// → enums). Output is identical in shape to the prose path, so the preview /
// confirm pipeline is reused unchanged.

export function buildStage1SystemCsv(): string {
  return `You are an ontology extractor for TABULAR (CSV) data. The input is CSV: the FIRST row is the header (the column names) and every later row is one record. Read the column names, the cell values, and the overall structure before deciding anything.

Build an ontology that does BOTH:
(a) DESCRIBES THE DATA — what single kind of thing each row is, and what each column means (its type); and
(b) surfaces the STRUCTURAL INSIGHT the table encodes — which columns point to other real-world entities, and which columns are categories.

The decisive axis is SCHEMA vs DATA: a "class" is the template/category, an "instance" is one concrete record that fills the columns with values.

For each entity provide:
- name, type, nodeKind, parentType, evidence, description, properties — exactly as defined for the prose extractor (same schema). evidence is a short verbatim span (a header or a row) from the CSV. description is null unless the data itself defines the thing.

Extraction steps:
1. MAIN OBJECT TYPE — one class. Decide what single real-world thing each ROW represents (an asset, a person, a transaction, an event, a product, a measurement record...). Emit ONE class for it, named as a singular noun inferred from the columns and any id/name column (NOT from a file title). Set nodeKind="class", type=null, parentType=null, properties=[].
2. ROWS to INSTANCES — emit one instance per data row. nodeKind="instance", parentType = the main class name. Name each instance from the row's natural key (an id / code / name column value); if the row has no such key, use the main type plus the row number. Put EVERY informative column of that row into "properties" as { "name": <column header>, "value": <cell value>, "dataType", "enumValues" }. Skip empty cells.
3. dataType per column — infer from the values and keep it consistent down the column: "integer" (whole numbers), "float" (decimals), "boolean" (yes/no, true/false, Y/N, 예/아니오), "date" (dates or timestamps), "enum" (a small fixed set of category labels — see step 4), otherwise "string".
4. CATEGORICAL columns to enum property, NOT a node. A column whose cells repeat a small fixed set of labels (status, grade, type, level, state — 등급/상태/구분/유형 ...) is an enum: set its dataType="enum" and "enumValues" to the full list of distinct labels seen in that column. Never create a class or an instance for a category label itself.
5. REFERENCE columns to a separate entity — this is the key insight. A column whose cells NAME another real-world entity that has its own identity — an organizational unit, a person, a vendor/supplier, a location, a parent category shared across rows (a foreign-key-like column) — denotes a SECOND object type. For each such column:
    • emit a class for that referenced type (nodeKind="class", type=null), named as a singular noun from the column;
    • emit the column's DISTINCT cell values as instances of that class (nodeKind="instance", parentType = that referenced class name); collapse repeated values into ONE instance;
    • ALSO keep the raw value on the row instance as a normal property, so the row stays self-contained. The link between the row and the referenced entity is added in the relation stage.
   Only treat a column this way when its cells are genuine, shared entity identities — NOT for free text, measurements, or one-off descriptions.
6. A pure measurement, number, unit, or free-text note is ALWAYS a property value — NEVER its own node.

Keep the hierarchy flat (Foundry-style object types). Do not invent abstract grouping levels the columns do not state.

Do NOT extract relations in this stage.

${SHARED_RULES}`;
}

export function buildStage1UserCsv(ctx: PromptContext): string {
  const parts = [
    `Analyze this CSV data (first row is the header):\n"""\n${ctx.text}\n"""`,
  ];
  if (ctx.existingSchema) {
    parts.push(
      `Existing ontology (reuse these classes as types when a column or row matches, instead of inventing a duplicate):\n${ctx.existingSchema}`,
    );
  } else if (ctx.existingClasses?.length) {
    parts.push(
      `Existing classes (reuse when relevant): ${ctx.existingClasses.join(', ')}`,
    );
  }
  return parts.join('\n\n');
}

export function buildStage2SystemCsv(): string {
  return `You are an ontology relation extractor for TABULAR (CSV) data. You are given the entities already extracted from a CSV and the original CSV. Extract the relations the TABLE encodes.

In a table, two entities that appear in the SAME ROW through a reference column ARE related — this is the table's foreign key, and it is genuine grounding, NOT mere co-occurrence. Emit a relation from the row's record instance to the referenced-entity instance named in that same row.

For each relation provide:
- source: the record (row) instance name. target: the referenced-entity instance named by a reference column in that row.
- type: a concise verb naming the link, derived from the column's meaning (a "공급사"/supplier column -> "supplied_by"; a "부서"/department column -> "belongs_to"; a "담당자"/owner column -> "assigned_to"; a "위치"/location column -> "located_in"). Keep the verb general — do NOT bake the specific cell value into the predicate.
- layer: classify as exactly one — "semantic" (the relation states knowledge: composition, containment, location, causation, description — what IS) or "kinetic" (the relation is an action to perform: inspect, check, replace, execute, a procedure or response — what to DO). Reference-column links (belongs-to, located-in, supplied-by, assigned-to, part-of, owned-by) are "semantic". Use "kinetic" ONLY if the table explicitly encodes an action or response step between records.
- evidence: the row (or the relevant header+cell) that grounds the link.
- confidence: 0..1, how strongly the table supports this link EXISTING.

Rules:
- Only relate a record to the entities named by its OWN row's reference columns. Never relate two records to each other merely because they share a column value — that shared value is the referenced entity, so relate BOTH records TO it instead.
- Do NOT emit a relation that merely restates a record's own property value, measurement, number, or unit — those are already captured as properties in stage 1. A relation must connect two DISTINCT real entities.
- If the CSV has no reference columns, return no relations. Honest islands are fine.

${SHARED_RULES}`;
}
