/**
 * Converts internal ontology data to JSON-LD format.
 *
 * Mapping rules:
 * - class -> owl:Class
 * - property -> owl:DatatypeProperty (with rdfs:domain linking to class)
 * - relation type -> owl:ObjectProperty (with rdfs:domain / rdfs:range)
 * - instance -> owl:NamedIndividual + rdf:type pointing to class
 * - edge -> assertion triple (instance/class as subject, relation as predicate, target as object)
 * - class hierarchy -> rdfs:subClassOf
 */

import {
  DEFAULT_NAMESPACE,
  RDF,
  RDFS,
  OWL,
  XSD,
  JSONLD_CONTEXT,
  DATA_TYPE_TO_XSD,
} from './constants';

export interface OntologyData {
  classes: Array<Record<string, unknown>>;
  properties: Array<Record<string, unknown>>;
  instances: Array<Record<string, unknown>>;
  instanceValues: Array<Record<string, unknown>>;
  relationTypes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

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

export function ontologyToJsonLd(data: OntologyData): Record<string, unknown> {
  const ns = DEFAULT_NAMESPACE;
  const graph: Record<string, unknown>[] = [];

  // Build lookup maps
  const classMap = new Map<string, Record<string, unknown>>();
  for (const cls of data.classes) {
    classMap.set(cls.id as string, cls);
  }

  const propertyMap = new Map<string, Record<string, unknown>>();
  for (const prop of data.properties) {
    propertyMap.set(prop.id as string, prop);
  }

  const instanceMap = new Map<string, Record<string, unknown>>();
  for (const inst of data.instances) {
    instanceMap.set(inst.id as string, inst);
  }

  const relationMap = new Map<string, Record<string, unknown>>();
  for (const rt of data.relationTypes) {
    relationMap.set(rt.id as string, rt);
  }

  // --- Classes -> owl:Class ---
  for (const cls of data.classes) {
    const id = cls.id as string;
    const clsNs = (cls.namespace as string) || ns;
    const node: Record<string, unknown> = {
      '@id': classUri(clsNs, id),
      '@type': `${OWL}Class`,
      [`${RDFS}label`]: cls.name,
      [`${RDFS}comment`]: cls.description ?? '',
      [`${ns}color`]: cls.color ?? '#7c3aed',
      [`${ns}positionX`]: { '@value': cls.positionX ?? 0, '@type': `${XSD}float` },
      [`${ns}positionY`]: { '@value': cls.positionY ?? 0, '@type': `${XSD}float` },
      [`${ns}internalId`]: id,
    };

    if (cls.parentId) {
      const parent = classMap.get(cls.parentId as string);
      const parentNs = parent ? ((parent.namespace as string) || ns) : ns;
      node[`${RDFS}subClassOf`] = { '@id': classUri(parentNs, cls.parentId as string) };
    }

    graph.push(node);
  }

  // --- Properties -> owl:DatatypeProperty ---
  for (const prop of data.properties) {
    const id = prop.id as string;
    const cls = classMap.get(prop.classId as string);
    const clsNs = cls ? ((cls.namespace as string) || ns) : ns;

    const node: Record<string, unknown> = {
      '@id': propertyUri(ns, id),
      '@type': `${OWL}DatatypeProperty`,
      [`${RDFS}label`]: prop.name,
      [`${RDFS}domain`]: { '@id': classUri(clsNs, prop.classId as string) },
      [`${RDFS}range`]: {
        '@id': DATA_TYPE_TO_XSD[prop.dataType as string] ?? `${XSD}string`,
      },
      [`${ns}isRequired`]: { '@value': prop.isRequired ?? false, '@type': `${XSD}boolean` },
      [`${ns}sortOrder`]: { '@value': prop.sortOrder ?? 0, '@type': `${XSD}integer` },
      [`${ns}internalId`]: id,
    };

    if (prop.enumValues && Array.isArray(prop.enumValues) && (prop.enumValues as string[]).length > 0) {
      node[`${ns}enumValues`] = (prop.enumValues as string[]).map((v: string) => ({
        '@value': v,
      }));
    }

    graph.push(node);
  }

  // --- Relation Types -> owl:ObjectProperty ---
  for (const rt of data.relationTypes) {
    const id = rt.id as string;
    const node: Record<string, unknown> = {
      '@id': relationUri(ns, id),
      '@type': `${OWL}ObjectProperty`,
      [`${RDFS}label`]: rt.name,
      [`${RDFS}comment`]: rt.description ?? '',
      [`${ns}internalId`]: id,
    };

    if (rt.sourceClassId) {
      const srcCls = classMap.get(rt.sourceClassId as string);
      const srcNs = srcCls ? ((srcCls.namespace as string) || ns) : ns;
      node[`${RDFS}domain`] = { '@id': classUri(srcNs, rt.sourceClassId as string) };
    }
    if (rt.targetClassId) {
      const tgtCls = classMap.get(rt.targetClassId as string);
      const tgtNs = tgtCls ? ((tgtCls.namespace as string) || ns) : ns;
      node[`${RDFS}range`] = { '@id': classUri(tgtNs, rt.targetClassId as string) };
    }

    graph.push(node);
  }

  // --- Instances -> owl:NamedIndividual ---
  for (const inst of data.instances) {
    const id = inst.id as string;
    const cls = classMap.get(inst.classId as string);
    const clsNs = cls ? ((cls.namespace as string) || ns) : ns;

    const node: Record<string, unknown> = {
      '@id': instanceUri(ns, id),
      '@type': [`${OWL}NamedIndividual`, classUri(clsNs, inst.classId as string)],
      [`${RDFS}label`]: inst.name,
      [`${ns}internalId`]: id,
    };

    // Attach property values
    const values = data.instanceValues.filter(
      (iv) => iv.instanceId === id,
    );
    for (const iv of values) {
      const prop = propertyMap.get(iv.propertyId as string);
      if (prop) {
        const propId = propertyUri(ns, iv.propertyId as string);
        const xsdType = DATA_TYPE_TO_XSD[prop.dataType as string] ?? `${XSD}string`;
        node[propId] = { '@value': iv.value ?? '', '@type': xsdType };
      }
    }

    graph.push(node);
  }

  // --- Edges -> assertion triples (embedded in subject nodes) ---
  // Group edges by source
  const edgesBySource = new Map<string, Array<Record<string, unknown>>>();
  for (const edge of data.edges) {
    const sourceId = edge.sourceId as string;
    if (!edgesBySource.has(sourceId)) {
      edgesBySource.set(sourceId, []);
    }
    edgesBySource.get(sourceId)!.push(edge);
  }

  for (const [sourceId, sourceEdges] of edgesBySource) {
    const firstEdge = sourceEdges[0];
    const sourceKind = firstEdge.sourceKind as string;

    // Find or create the source node
    const sourceUriStr =
      sourceKind === 'instance'
        ? instanceUri(ns, sourceId)
        : (() => {
            const cls = classMap.get(sourceId);
            const clsNs = cls ? ((cls.namespace as string) || ns) : ns;
            return classUri(clsNs, sourceId);
          })();

    // Find existing node in graph
    let existingNode = graph.find((n) => n['@id'] === sourceUriStr);
    if (!existingNode) {
      existingNode = { '@id': sourceUriStr };
      graph.push(existingNode);
    }

    for (const edge of sourceEdges) {
      const rt = relationMap.get(edge.relationTypeId as string);
      if (!rt) continue;

      const relUri = relationUri(ns, edge.relationTypeId as string);
      const targetId = edge.targetId as string;
      const targetKind = edge.targetKind as string;
      const targetUriStr =
        targetKind === 'instance'
          ? instanceUri(ns, targetId)
          : (() => {
              const cls = classMap.get(targetId);
              const clsNs = cls ? ((cls.namespace as string) || ns) : ns;
              return classUri(clsNs, targetId);
            })();

      // Add relation as property
      const existing = existingNode[relUri];
      if (existing) {
        if (Array.isArray(existing)) {
          (existing as Array<unknown>).push({ '@id': targetUriStr });
        } else {
          existingNode[relUri] = [existing, { '@id': targetUriStr }];
        }
      } else {
        existingNode[relUri] = { '@id': targetUriStr };
      }
    }
  }

  return {
    '@context': JSONLD_CONTEXT,
    '@graph': graph,
  };
}
