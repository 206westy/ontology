import { NODE_COLORS } from '../constants/colors';
import { levenshtein, normalizeName } from './similarity';
import type { LlmParseResult } from '../api';

// Shape the preview/confirm pipeline understands. Carries optional evidence and
// confidence so later stages (A-3/A-5) can display and persist provenance.
export interface ParsedExtraction {
  classes: {
    name: string;
    description: string;
    color: string | null;
    parentName: string | null;
    evidence?: string;
  }[];
  properties: {
    className: string;
    name: string;
    dataType: string;
    isRequired: boolean;
    enumValues: string[] | null;
  }[];
  relations: {
    sourceName: string;
    targetName: string;
    relationName: string;
    evidence?: string;
    confidence?: number;
  }[];
  instances: {
    className: string;
    name: string;
    evidence?: string;
    values?: { propertyName: string; value: string; dataType: string }[];
  }[];
}

// Map the multi-stage parse output (entities + relations) onto the class/instance
// pipeline the preview/confirm flow understands (A-1 / A-1.1):
// - class-kind entities become classes (parented by their type category)
// - instance-kind entities become instances of their parentType class, carrying
//   property values; the class gains the corresponding property definitions
// - relation endpoints not extracted as entities become flat classes so the edge
//   can resolve (these surface later as undefined-concept gaps in A-3)
export function mapParseResult(
  res: LlmParseResult,
  existingClassNames: Set<string>,
  existingInstanceNames: Set<string> = new Set(),
): ParsedExtraction {
  const classes: ParsedExtraction['classes'] = [];
  const instances: ParsedExtraction['instances'] = [];
  const properties: ParsedExtraction['properties'] = [];
  const seenClass = new Set<string>();
  const seenInstance = new Set<string>();
  const propDefSeen = new Set<string>();
  const entities = res.entities ?? [];
  const rawRelations = res.relations ?? [];

  const addClass = (
    name: string,
    parentName: string | null,
    color: string,
    evidence?: string,
  ) => {
    const trimmed = name.trim();
    if (!trimmed || seenClass.has(trimmed) || existingClassNames.has(trimmed)) return;
    classes.push({ name: trimmed, description: '', color, parentName, evidence });
    seenClass.add(trimmed);
  };

  const kindOf = (e: LlmParseResult['entities'][number]) => e.nodeKind ?? 'class';
  const classNameFor = (e: LlmParseResult['entities'][number]) =>
    (e.parentType?.trim() || e.type?.trim() || '').trim();

  // 1) Category classes first, so entities/instances can parent onto them.
  for (const e of entities) {
    if (kindOf(e) === 'class') {
      if (e.type?.trim()) addClass(e.type, null, NODE_COLORS.root);
    } else {
      const cn = classNameFor(e);
      if (cn) addClass(cn, null, NODE_COLORS.root);
    }
  }

  // 2) Class-kind entities.
  for (const e of entities) {
    if (kindOf(e) !== 'class') continue;
    addClass(e.name, e.type?.trim() ? e.type.trim() : null, NODE_COLORS.mid, e.evidence);
  }

  // 3) Instance-kind entities.
  for (const e of entities) {
    if (kindOf(e) !== 'instance') continue;
    const className = classNameFor(e);
    const name = e.name.trim();
    if (!name) continue;

    if (!className) {
      // Instance with no category — fall back to a class so it isn't lost.
      addClass(name, null, NODE_COLORS.mid, e.evidence);
      continue;
    }
    addClass(className, null, NODE_COLORS.root);

    if (seenInstance.has(name) || existingInstanceNames.has(name)) continue;
    const values = (e.properties ?? []).map((p) => ({
      propertyName: p.name,
      value: p.value,
      dataType: p.dataType,
    }));
    instances.push({ className, name, evidence: e.evidence, values });
    seenInstance.add(name);

    // Derive class property definitions from instance property names.
    for (const p of e.properties ?? []) {
      const key = `${className}::${p.name}`;
      if (propDefSeen.has(key)) continue;
      properties.push({
        className,
        name: p.name,
        dataType: p.dataType,
        isRequired: false,
        enumValues: null,
      });
      propDefSeen.add(key);
    }
  }

  const relations = rawRelations.map((r) => ({
    sourceName: r.source,
    targetName: r.target,
    relationName: r.type,
    evidence: r.evidence,
    confidence: r.confidence,
  }));

  // Ensure relation endpoints exist as nodes (class fallback if neither a class
  // nor an instance was extracted for that name).
  for (const r of relations) {
    for (const endpoint of [r.sourceName, r.targetName]) {
      const t = endpoint.trim();
      if (!t) continue;
      if (seenInstance.has(t) || existingInstanceNames.has(t)) continue;
      addClass(t, null, NODE_COLORS.leaf);
    }
  }

  return { classes, properties, relations, instances };
}

// Islands (A-5): newly-extracted nodes with no grounded relation AND no place in
// the is-a hierarchy (neither a parent nor a child). These are honest islands —
// the preview offers an optional connection suggestion but never forces one.
export function computeIslands(parsed: ParsedExtraction): string[] {
  const connected = new Set<string>();
  for (const r of parsed.relations) {
    connected.add(r.sourceName);
    connected.add(r.targetName);
  }
  const isParent = new Set<string>();
  const hasParent = new Set<string>();
  for (const c of parsed.classes) {
    if (c.parentName) {
      isParent.add(c.parentName);
      hasParent.add(c.name);
    }
  }
  return parsed.classes
    .filter(
      (c) =>
        !connected.has(c.name) && !isParent.has(c.name) && !hasParent.has(c.name),
    )
    .map((c) => c.name);
}

// Flag newly-extracted class names that look like an existing class but aren't an
// exact reuse (A-2). These are synonym suspects — we do NOT auto-merge; the UI
// shows a "중복 가능" badge and routes the user to the P0-2 ER queue.
// Returns Map<newName, closestExistingName>.
export function findPossibleDuplicates(
  newNames: string[],
  existingNames: string[],
  opts: { minScore?: number; maxDistance?: number } = {},
): Map<string, string> {
  const minScore = opts.minScore ?? 0.8;
  const maxDistance = opts.maxDistance ?? 2;
  const result = new Map<string, string>();

  const existing = existingNames
    .map((name) => ({ name, norm: normalizeName(name) }))
    .filter((e) => e.norm.length > 0);

  for (const newName of newNames) {
    const na = normalizeName(newName);
    if (!na) continue;

    let best: { name: string; score: number } | null = null;
    for (const ex of existing) {
      const distance = levenshtein(na, ex.norm);
      const score = 1 - distance / Math.max(na.length, ex.norm.length);
      if (score >= minScore && distance <= maxDistance && (!best || score > best.score)) {
        best = { name: ex.name, score };
      }
    }
    if (best) result.set(newName, best.name);
  }

  return result;
}
