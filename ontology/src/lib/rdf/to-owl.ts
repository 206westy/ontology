/**
 * Converts internal ontology data to OWL/XML (OWL 2 XML Serialization) format.
 * No external libraries — builds XML string directly.
 *
 * ─── Mapping Coverage ────────────────────────────────────────
 * SUPPORTED:
 *   - owl:Class              (classes table)
 *   - rdfs:subClassOf        (class hierarchy via parentId)
 *   - owl:DatatypeProperty   (properties table, with rdfs:domain / rdfs:range)
 *   - owl:ObjectProperty     (relationTypes table, with rdfs:domain / rdfs:range)
 *   - owl:NamedIndividual    (instances table, rdf:type -> class)
 *   - Instance values        (property assertions on NamedIndividuals)
 *   - Edge assertions        (ObjectPropertyAssertion triples)
 *   - owl:Restriction        (cardinality constraints on edges, partial)
 *
 * NOT SUPPORTED:
 *   - Memo rules (constraints kind='memo' — project-specific, no standard OWL mapping)
 *   - Complex OWL DL expressions (unions, intersections, complements)
 *   - Disjoint / property_value / domain_range constraints
 *   - Annotation properties beyond rdfs:label / rdfs:comment
 */

import {
  DEFAULT_NAMESPACE,
  RDF,
  RDFS,
  OWL,
  XSD,
  DATA_TYPE_TO_XSD,
} from './constants';

import type { OntologyData } from './to-jsonld';

// ─── XML escaping (mandatory for all text content / attribute values) ──
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── URI helpers (same convention as JSON-LD / Turtle exports) ──
function classUri(ns: string, id: string): string {
  return `${ns}class/${id}`;
}

function propertyUri(ns: string, id: string): string {
  return `${ns}property/${id}`;
}

function instanceUri(ns: string, id: string): string {
  return `${ns}instance/${id}`;
}

function relationUri(ns: string, id: string): string {
  return `${ns}relation/${id}`;
}

export function ontologyToOwlXml(data: OntologyData): string {
  const ns = DEFAULT_NAMESPACE;
  const lines: string[] = [];

  // ─── Lookup maps ──
  const classMap = new Map<string, Record<string, unknown>>();
  for (const cls of data.classes) {
    classMap.set(cls.id as string, cls);
  }

  const propertyMap = new Map<string, Record<string, unknown>>();
  for (const prop of data.properties) {
    propertyMap.set(prop.id as string, prop);
  }

  const relationMap = new Map<string, Record<string, unknown>>();
  for (const rt of data.relationTypes) {
    relationMap.set(rt.id as string, rt);
  }

  function resolveClassUri(id: string): string {
    const cls = classMap.get(id);
    const clsNs = cls ? ((cls.namespace as string) || ns) : ns;
    return classUri(clsNs, id);
  }

  // ─── XML Preamble ──
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<rdf:RDF');
  lines.push(`    xmlns:rdf="${escapeXml(RDF)}"`);
  lines.push(`    xmlns:rdfs="${escapeXml(RDFS)}"`);
  lines.push(`    xmlns:owl="${escapeXml(OWL)}"`);
  lines.push(`    xmlns:xsd="${escapeXml(XSD)}"`);
  lines.push(`    xmlns:os="${escapeXml(ns)}"`);
  lines.push(`    xml:base="${escapeXml(ns)}">`);
  lines.push('');

  // ─── Ontology declaration ──
  lines.push(`  <owl:Ontology rdf:about="${escapeXml(ns)}">`);
  lines.push(`    <rdfs:label>Ontology Studio Export</rdfs:label>`);
  lines.push('  </owl:Ontology>');
  lines.push('');

  // ─── Classes -> owl:Class ──
  for (const cls of data.classes) {
    const id = cls.id as string;
    const clsNs = (cls.namespace as string) || ns;
    const uri = classUri(clsNs, id);

    lines.push(`  <owl:Class rdf:about="${escapeXml(uri)}">`);
    lines.push(`    <rdfs:label>${escapeXml(cls.name as string)}</rdfs:label>`);
    if (cls.description) {
      lines.push(`    <rdfs:comment>${escapeXml(cls.description as string)}</rdfs:comment>`);
    }
    lines.push(`    <os:color>${escapeXml((cls.color as string) ?? '#7c3aed')}</os:color>`);
    lines.push(`    <os:positionX rdf:datatype="${escapeXml(XSD)}float">${cls.positionX ?? 0}</os:positionX>`);
    lines.push(`    <os:positionY rdf:datatype="${escapeXml(XSD)}float">${cls.positionY ?? 0}</os:positionY>`);
    lines.push(`    <os:internalId>${escapeXml(id)}</os:internalId>`);

    // rdfs:subClassOf (class hierarchy)
    if (cls.parentId) {
      const parentUri = resolveClassUri(cls.parentId as string);
      lines.push(`    <rdfs:subClassOf rdf:resource="${escapeXml(parentUri)}"/>`);
    }

    lines.push('  </owl:Class>');
    lines.push('');
  }

  // ─── Properties -> owl:DatatypeProperty ──
  for (const prop of data.properties) {
    const id = prop.id as string;
    const uri = propertyUri(ns, id);
    const domainUri = resolveClassUri(prop.classId as string);
    const xsdType = DATA_TYPE_TO_XSD[prop.dataType as string] ?? `${XSD}string`;

    lines.push(`  <owl:DatatypeProperty rdf:about="${escapeXml(uri)}">`);
    lines.push(`    <rdfs:label>${escapeXml(prop.name as string)}</rdfs:label>`);
    lines.push(`    <rdfs:domain rdf:resource="${escapeXml(domainUri)}"/>`);
    lines.push(`    <rdfs:range rdf:resource="${escapeXml(xsdType)}"/>`);
    lines.push(`    <os:isRequired rdf:datatype="${escapeXml(XSD)}boolean">${prop.isRequired ?? false}</os:isRequired>`);
    lines.push(`    <os:sortOrder rdf:datatype="${escapeXml(XSD)}integer">${prop.sortOrder ?? 0}</os:sortOrder>`);
    lines.push(`    <os:internalId>${escapeXml(id)}</os:internalId>`);

    // Enum values
    if (prop.enumValues && Array.isArray(prop.enumValues)) {
      for (const ev of prop.enumValues as string[]) {
        lines.push(`    <os:enumValues>${escapeXml(ev)}</os:enumValues>`);
      }
    }

    lines.push('  </owl:DatatypeProperty>');
    lines.push('');
  }

  // ─── Relation Types -> owl:ObjectProperty ──
  for (const rt of data.relationTypes) {
    const id = rt.id as string;
    const uri = relationUri(ns, id);

    lines.push(`  <owl:ObjectProperty rdf:about="${escapeXml(uri)}">`);
    lines.push(`    <rdfs:label>${escapeXml(rt.name as string)}</rdfs:label>`);
    if (rt.description) {
      lines.push(`    <rdfs:comment>${escapeXml(rt.description as string)}</rdfs:comment>`);
    }
    lines.push(`    <os:internalId>${escapeXml(id)}</os:internalId>`);

    if (rt.sourceClassId) {
      lines.push(`    <rdfs:domain rdf:resource="${escapeXml(resolveClassUri(rt.sourceClassId as string))}"/>`);
    }
    if (rt.targetClassId) {
      lines.push(`    <rdfs:range rdf:resource="${escapeXml(resolveClassUri(rt.targetClassId as string))}"/>`);
    }

    lines.push('  </owl:ObjectProperty>');
    lines.push('');
  }

  // ─── owl:Restriction (cardinality from edges, partial support) ──
  // Group cardinality constraints by (sourceClass, relationTypeId) to emit subClassOf restrictions
  const cardinalityEdges = data.edges.filter(
    (e) =>
      e.sourceKind === 'class' &&
      e.targetKind === 'class' &&
      (e.minCardinality != null || e.maxCardinality != null),
  );

  // Deduplicate by (sourceId, relationTypeId) — take the first edge's cardinality
  const seenRestrictions = new Set<string>();
  for (const edge of cardinalityEdges) {
    const key = `${edge.sourceId}::${edge.relationTypeId}`;
    if (seenRestrictions.has(key)) continue;
    seenRestrictions.add(key);

    const sourceUri = resolveClassUri(edge.sourceId as string);
    const relUri = relationUri(ns, edge.relationTypeId as string);
    const targetUri = resolveClassUri(edge.targetId as string);

    lines.push(`  <!-- owl:Restriction for cardinality on ${escapeXml(key)} -->`);
    lines.push(`  <owl:Class rdf:about="${escapeXml(sourceUri)}">`);
    lines.push('    <rdfs:subClassOf>');
    lines.push('      <owl:Restriction>');
    lines.push(`        <owl:onProperty rdf:resource="${escapeXml(relUri)}"/>`);
    lines.push(`        <owl:onClass rdf:resource="${escapeXml(targetUri)}"/>`);

    if (edge.minCardinality != null) {
      lines.push(`        <owl:minQualifiedCardinality rdf:datatype="${escapeXml(XSD)}nonNegativeInteger">${edge.minCardinality}</owl:minQualifiedCardinality>`);
    }
    if (edge.maxCardinality != null) {
      lines.push(`        <owl:maxQualifiedCardinality rdf:datatype="${escapeXml(XSD)}nonNegativeInteger">${edge.maxCardinality}</owl:maxQualifiedCardinality>`);
    }

    lines.push('      </owl:Restriction>');
    lines.push('    </rdfs:subClassOf>');
    lines.push('  </owl:Class>');
    lines.push('');
  }

  // ─── Instances -> owl:NamedIndividual ──
  // Pre-group instance values by instanceId for O(1) lookup
  const valuesByInstance = new Map<string, Array<Record<string, unknown>>>();
  for (const iv of data.instanceValues) {
    const instId = iv.instanceId as string;
    if (!valuesByInstance.has(instId)) {
      valuesByInstance.set(instId, []);
    }
    valuesByInstance.get(instId)!.push(iv);
  }

  for (const inst of data.instances) {
    const id = inst.id as string;
    const uri = instanceUri(ns, id);
    const typeUri = resolveClassUri(inst.classId as string);

    lines.push(`  <owl:NamedIndividual rdf:about="${escapeXml(uri)}">`);
    lines.push(`    <rdf:type rdf:resource="${escapeXml(typeUri)}"/>`);
    lines.push(`    <rdfs:label>${escapeXml(inst.name as string)}</rdfs:label>`);
    lines.push(`    <os:internalId>${escapeXml(id)}</os:internalId>`);

    // Instance property values (DataPropertyAssertion)
    // Uses os:propertyValue blank nodes since property URIs contain path segments
    // that cannot be expressed as XML element names directly
    const values = valuesByInstance.get(id) ?? [];
    for (const iv of values) {
      const prop = propertyMap.get(iv.propertyId as string);
      if (!prop) continue;

      const propIri = propertyUri(ns, iv.propertyId as string);
      const xsdType = DATA_TYPE_TO_XSD[prop.dataType as string] ?? `${XSD}string`;
      lines.push('    <os:hasPropertyValue>');
      lines.push('      <rdf:Description>');
      lines.push(`        <os:onProperty rdf:resource="${escapeXml(propIri)}"/>`);
      lines.push(`        <os:value rdf:datatype="${escapeXml(xsdType)}">${escapeXml(String(iv.value ?? ''))}</os:value>`);
      lines.push('      </rdf:Description>');
      lines.push('    </os:hasPropertyValue>');
    }

    lines.push('  </owl:NamedIndividual>');
    lines.push('');
  }

  // ─── Edges -> ObjectPropertyAssertion triples ──
  // Uses os:hasRelation blank nodes since relation URIs contain path segments
  // that cannot be expressed as XML element names directly in RDF/XML
  for (const edge of data.edges) {
    const rt = relationMap.get(edge.relationTypeId as string);
    if (!rt) continue;

    const sourceId = edge.sourceId as string;
    const targetId = edge.targetId as string;
    const sourceKind = edge.sourceKind as string;
    const targetKind = edge.targetKind as string;

    const sourceUriStr = sourceKind === 'instance' ? instanceUri(ns, sourceId) : resolveClassUri(sourceId);
    const targetUriStr = targetKind === 'instance' ? instanceUri(ns, targetId) : resolveClassUri(targetId);
    const relIri = relationUri(ns, edge.relationTypeId as string);

    lines.push(`  <rdf:Description rdf:about="${escapeXml(sourceUriStr)}">`);
    lines.push('    <os:hasRelation>');
    lines.push('      <rdf:Description>');
    lines.push(`        <os:onRelation rdf:resource="${escapeXml(relIri)}"/>`);
    lines.push(`        <os:target rdf:resource="${escapeXml(targetUriStr)}"/>`);
    lines.push('      </rdf:Description>');
    lines.push('    </os:hasRelation>');
    lines.push('  </rdf:Description>');
    lines.push('');
  }

  lines.push('</rdf:RDF>');

  return lines.join('\n');
}
