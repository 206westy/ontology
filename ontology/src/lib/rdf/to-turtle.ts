/**
 * Converts internal ontology data to Turtle format using N3.Writer.
 *
 * Same mapping rules as JSON-LD export:
 * - class -> owl:Class
 * - property -> owl:DatatypeProperty
 * - relation type -> owl:ObjectProperty
 * - instance -> owl:NamedIndividual + rdf:type
 * - edge -> assertion triple
 * - class hierarchy -> rdfs:subClassOf
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

export async function ontologyToTurtle(data: OntologyData): Promise<string> {
  // Dynamic import to keep n3 out of the initial bundle
  const N3 = await import(/* webpackIgnore: true */ 'n3');
  const { DataFactory } = N3;
  const { namedNode, literal, quad } = DataFactory;

  const ns = DEFAULT_NAMESPACE;

  const writer = new N3.Writer({
    prefixes: {
      rdf: RDF,
      rdfs: RDFS,
      owl: OWL,
      xsd: XSD,
      os: ns,
    },
  });

  // Build lookup maps
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

  function classUri(id: string): string {
    const cls = classMap.get(id);
    const clsNs = cls ? ((cls.namespace as string) || ns) : ns;
    return `${clsNs}class/${id}`;
  }

  function propUri(id: string): string {
    return `${ns}property/${id}`;
  }

  function relUri(id: string): string {
    return `${ns}relation/${id}`;
  }

  function instUri(id: string): string {
    return `${ns}instance/${id}`;
  }

  // --- Classes ---
  for (const cls of data.classes) {
    const id = cls.id as string;
    const uri = classUri(id);

    writer.addQuad(quad(namedNode(uri), namedNode(`${RDF}type`), namedNode(`${OWL}Class`)));
    writer.addQuad(quad(namedNode(uri), namedNode(`${RDFS}label`), literal(cls.name as string)));
    if (cls.description) {
      writer.addQuad(quad(namedNode(uri), namedNode(`${RDFS}comment`), literal(cls.description as string)));
    }
    writer.addQuad(quad(namedNode(uri), namedNode(`${ns}color`), literal(cls.color as string ?? '#7c3aed')));
    writer.addQuad(quad(
      namedNode(uri),
      namedNode(`${ns}positionX`),
      literal(String(cls.positionX ?? 0), namedNode(`${XSD}float`)),
    ));
    writer.addQuad(quad(
      namedNode(uri),
      namedNode(`${ns}positionY`),
      literal(String(cls.positionY ?? 0), namedNode(`${XSD}float`)),
    ));
    writer.addQuad(quad(namedNode(uri), namedNode(`${ns}internalId`), literal(id)));

    if (cls.parentId) {
      writer.addQuad(quad(namedNode(uri), namedNode(`${RDFS}subClassOf`), namedNode(classUri(cls.parentId as string))));
    }
  }

  // --- Properties -> owl:DatatypeProperty ---
  for (const prop of data.properties) {
    const id = prop.id as string;
    const uri = propUri(id);

    writer.addQuad(quad(namedNode(uri), namedNode(`${RDF}type`), namedNode(`${OWL}DatatypeProperty`)));
    writer.addQuad(quad(namedNode(uri), namedNode(`${RDFS}label`), literal(prop.name as string)));
    writer.addQuad(quad(namedNode(uri), namedNode(`${RDFS}domain`), namedNode(classUri(prop.classId as string))));

    const xsdType = DATA_TYPE_TO_XSD[prop.dataType as string] ?? `${XSD}string`;
    writer.addQuad(quad(namedNode(uri), namedNode(`${RDFS}range`), namedNode(xsdType)));

    writer.addQuad(quad(
      namedNode(uri),
      namedNode(`${ns}isRequired`),
      literal(String(prop.isRequired ?? false), namedNode(`${XSD}boolean`)),
    ));
    writer.addQuad(quad(
      namedNode(uri),
      namedNode(`${ns}sortOrder`),
      literal(String(prop.sortOrder ?? 0), namedNode(`${XSD}integer`)),
    ));
    writer.addQuad(quad(namedNode(uri), namedNode(`${ns}internalId`), literal(id)));

    if (prop.enumValues && Array.isArray(prop.enumValues)) {
      for (const ev of prop.enumValues as string[]) {
        writer.addQuad(quad(namedNode(uri), namedNode(`${ns}enumValues`), literal(ev)));
      }
    }
  }

  // --- Relation Types -> owl:ObjectProperty ---
  for (const rt of data.relationTypes) {
    const id = rt.id as string;
    const uri = relUri(id);

    writer.addQuad(quad(namedNode(uri), namedNode(`${RDF}type`), namedNode(`${OWL}ObjectProperty`)));
    writer.addQuad(quad(namedNode(uri), namedNode(`${RDFS}label`), literal(rt.name as string)));
    if (rt.description) {
      writer.addQuad(quad(namedNode(uri), namedNode(`${RDFS}comment`), literal(rt.description as string)));
    }
    writer.addQuad(quad(namedNode(uri), namedNode(`${ns}internalId`), literal(id)));

    if (rt.sourceClassId) {
      writer.addQuad(quad(namedNode(uri), namedNode(`${RDFS}domain`), namedNode(classUri(rt.sourceClassId as string))));
    }
    if (rt.targetClassId) {
      writer.addQuad(quad(namedNode(uri), namedNode(`${RDFS}range`), namedNode(classUri(rt.targetClassId as string))));
    }
  }

  // --- Instances -> owl:NamedIndividual ---
  for (const inst of data.instances) {
    const id = inst.id as string;
    const uri = instUri(id);

    writer.addQuad(quad(namedNode(uri), namedNode(`${RDF}type`), namedNode(`${OWL}NamedIndividual`)));
    writer.addQuad(quad(namedNode(uri), namedNode(`${RDF}type`), namedNode(classUri(inst.classId as string))));
    writer.addQuad(quad(namedNode(uri), namedNode(`${RDFS}label`), literal(inst.name as string)));
    writer.addQuad(quad(namedNode(uri), namedNode(`${ns}internalId`), literal(id)));

    // Instance values
    const values = data.instanceValues.filter((iv) => iv.instanceId === id);
    for (const iv of values) {
      const prop = propertyMap.get(iv.propertyId as string);
      if (prop) {
        const xsdType = DATA_TYPE_TO_XSD[prop.dataType as string] ?? `${XSD}string`;
        writer.addQuad(quad(
          namedNode(uri),
          namedNode(propUri(iv.propertyId as string)),
          literal(String(iv.value ?? ''), namedNode(xsdType)),
        ));
      }
    }
  }

  // --- Edges -> assertion triples ---
  for (const edge of data.edges) {
    const rt = relationMap.get(edge.relationTypeId as string);
    if (!rt) continue;

    const sourceId = edge.sourceId as string;
    const targetId = edge.targetId as string;
    const sourceKind = edge.sourceKind as string;
    const targetKind = edge.targetKind as string;

    const sourceUriStr = sourceKind === 'instance' ? instUri(sourceId) : classUri(sourceId);
    const targetUriStr = targetKind === 'instance' ? instUri(targetId) : classUri(targetId);

    writer.addQuad(quad(
      namedNode(sourceUriStr),
      namedNode(relUri(edge.relationTypeId as string)),
      namedNode(targetUriStr),
    ));
  }

  return new Promise<string>((resolve, reject) => {
    writer.end((error: Error | null, result: string) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}
