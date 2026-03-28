/**
 * Converts JSON-LD (expanded form) back to internal ontology model.
 *
 * Uses jsonld.expand() to normalize then walks the expanded nodes.
 */

import { DEFAULT_NAMESPACE, RDFS, OWL, XSD_TO_DATA_TYPE } from './constants';
import { randomUUID } from 'crypto';

const uuidv4 = () => randomUUID();

interface ExpandedNode {
  '@id'?: string;
  '@type'?: string[];
  '@value'?: unknown;
  [key: string]: unknown;
}

interface InternalOntology {
  classes: Array<Record<string, unknown>>;
  properties: Array<Record<string, unknown>>;
  instances: Array<Record<string, unknown>>;
  instanceValues: Array<Record<string, unknown>>;
  relationTypes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

function getValue(arr: unknown): string {
  if (Array.isArray(arr) && arr.length > 0) {
    const first = arr[0] as Record<string, unknown>;
    if (first['@value'] !== undefined) return String(first['@value']);
    if (first['@id'] !== undefined) return String(first['@id']);
    return String(first);
  }
  if (typeof arr === 'string') return arr;
  return '';
}

function getValues(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((item: unknown) => {
    const node = item as Record<string, unknown>;
    if (node['@value'] !== undefined) return String(node['@value']);
    if (node['@id'] !== undefined) return String(node['@id']);
    return String(node);
  });
}

function getIdRef(arr: unknown): string | null {
  if (Array.isArray(arr) && arr.length > 0) {
    const first = arr[0] as Record<string, unknown>;
    if (first['@id'] !== undefined) return String(first['@id']);
  }
  return null;
}

function getIdRefs(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item: unknown) => {
      const node = item as Record<string, unknown>;
      return node['@id'] ? String(node['@id']) : null;
    })
    .filter((v): v is string => v !== null);
}

function getBoolValue(arr: unknown): boolean {
  const val = getValue(arr);
  return val === 'true' || val === '1';
}

function getFloatValue(arr: unknown): number {
  const val = getValue(arr);
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function getIntValue(arr: unknown): number {
  const val = getValue(arr);
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

/** Extract internal ID from os:internalId or from URI path segment */
function extractId(node: ExpandedNode): string {
  const internalId = getValue(node[`${DEFAULT_NAMESPACE}internalId`]);
  if (internalId) return internalId;

  // Fallback: extract from URI
  const uri = node['@id'] ?? '';
  const segments = uri.split('/');
  const lastSegment = segments[segments.length - 1];
  // If it looks like a UUID, use it; otherwise generate one
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lastSegment)) {
    return lastSegment;
  }
  return uuidv4();
}

function hasType(node: ExpandedNode, typeUri: string): boolean {
  const types = node['@type'];
  if (!Array.isArray(types)) return false;
  return types.includes(typeUri);
}

export async function jsonLdToOntology(jsonLdDoc: unknown): Promise<InternalOntology> {
  // Dynamic import to keep jsonld out of the initial bundle
  const jsonld = (await import(/* webpackIgnore: true */ 'jsonld')).default;

  const expanded = (await jsonld.expand(jsonLdDoc as object)) as ExpandedNode[];

  const result: InternalOntology = {
    classes: [],
    properties: [],
    instances: [],
    instanceValues: [],
    relationTypes: [],
    edges: [],
  };

  // URI -> internal ID mappings
  const classUriToId = new Map<string, string>();
  const propertyUriToId = new Map<string, string>();
  const relationUriToId = new Map<string, string>();
  const instanceUriToId = new Map<string, string>();

  // First pass: categorize nodes
  const owlClasses: ExpandedNode[] = [];
  const owlDatatypeProperties: ExpandedNode[] = [];
  const owlObjectProperties: ExpandedNode[] = [];
  const owlIndividuals: ExpandedNode[] = [];
  const otherNodes: ExpandedNode[] = [];

  for (const node of expanded) {
    if (hasType(node, `${OWL}Class`)) {
      owlClasses.push(node);
    } else if (hasType(node, `${OWL}DatatypeProperty`)) {
      owlDatatypeProperties.push(node);
    } else if (hasType(node, `${OWL}ObjectProperty`)) {
      owlObjectProperties.push(node);
    } else if (hasType(node, `${OWL}NamedIndividual`)) {
      owlIndividuals.push(node);
    } else if (node['@id']) {
      otherNodes.push(node);
    }
  }

  // Process classes
  for (const node of owlClasses) {
    const id = extractId(node);
    const uri = node['@id'] ?? '';
    classUriToId.set(uri, id);

    const parentUri = getIdRef(node[`${RDFS}subClassOf`]);

    result.classes.push({
      id,
      name: getValue(node[`${RDFS}label`]),
      description: getValue(node[`${RDFS}comment`]),
      color: getValue(node[`${DEFAULT_NAMESPACE}color`]) || '#7c3aed',
      positionX: getFloatValue(node[`${DEFAULT_NAMESPACE}positionX`]),
      positionY: getFloatValue(node[`${DEFAULT_NAMESPACE}positionY`]),
      parentId: null, // resolved in second pass
      _parentUri: parentUri,
    });
  }

  // Resolve class parents
  for (const cls of result.classes) {
    const parentUri = cls._parentUri as string | null;
    delete cls._parentUri;
    if (parentUri) {
      cls.parentId = classUriToId.get(parentUri) ?? null;
    }
  }

  // Process object properties -> relation types
  for (const node of owlObjectProperties) {
    const id = extractId(node);
    const uri = node['@id'] ?? '';
    relationUriToId.set(uri, id);

    const domainUri = getIdRef(node[`${RDFS}domain`]);
    const rangeUri = getIdRef(node[`${RDFS}range`]);

    result.relationTypes.push({
      id,
      name: getValue(node[`${RDFS}label`]),
      description: getValue(node[`${RDFS}comment`]),
      sourceClassId: domainUri ? (classUriToId.get(domainUri) ?? null) : null,
      targetClassId: rangeUri ? (classUriToId.get(rangeUri) ?? null) : null,
    });
  }

  // Process datatype properties -> properties
  for (const node of owlDatatypeProperties) {
    const id = extractId(node);
    const uri = node['@id'] ?? '';
    propertyUriToId.set(uri, id);

    const domainUri = getIdRef(node[`${RDFS}domain`]);
    const rangeUri = getIdRef(node[`${RDFS}range`]);
    const dataType = rangeUri ? (XSD_TO_DATA_TYPE[rangeUri] ?? 'string') : 'string';

    const enumVals = getValues(node[`${DEFAULT_NAMESPACE}enumValues`]);

    result.properties.push({
      id,
      classId: domainUri ? (classUriToId.get(domainUri) ?? '') : '',
      name: getValue(node[`${RDFS}label`]),
      dataType: enumVals.length > 0 ? 'enum' : dataType,
      isRequired: getBoolValue(node[`${DEFAULT_NAMESPACE}isRequired`]),
      enumValues: enumVals.length > 0 ? enumVals : null,
      constraintRule: null,
      sortOrder: getIntValue(node[`${DEFAULT_NAMESPACE}sortOrder`]),
    });
  }

  // Process individuals -> instances + instance values
  for (const node of owlIndividuals) {
    const id = extractId(node);
    const uri = node['@id'] ?? '';
    instanceUriToId.set(uri, id);

    // Find classId from @type (other than owl:NamedIndividual)
    const types = (node['@type'] ?? []) as string[];
    const classType = types.find((t) => t !== `${OWL}NamedIndividual`);
    const classId = classType ? (classUriToId.get(classType) ?? '') : '';

    result.instances.push({
      id,
      classId,
      name: getValue(node[`${RDFS}label`]),
    });

    // Extract property values: keys that are property URIs
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith('@')) continue;
      if (key === `${RDFS}label` || key === `${DEFAULT_NAMESPACE}internalId`) continue;

      const propId = propertyUriToId.get(key);
      if (propId) {
        result.instanceValues.push({
          id: uuidv4(),
          instanceId: id,
          propertyId: propId,
          value: getValue(val),
        });
        continue;
      }

      // Check if it's a relation (object property)
      const relId = relationUriToId.get(key);
      if (relId) {
        const targetUris = getIdRefs(val);
        for (const targetUri of targetUris) {
          const targetInstanceId = instanceUriToId.get(targetUri);
          const targetClassId = classUriToId.get(targetUri);
          const targetId = targetInstanceId ?? targetClassId;
          if (targetId) {
            result.edges.push({
              id: uuidv4(),
              relationTypeId: relId,
              sourceId: id,
              targetId,
              sourceKind: 'instance',
              targetKind: targetInstanceId ? 'instance' : 'class',
            });
          }
        }
      }
    }
  }

  // Process edges from other nodes (class-level relations)
  for (const node of otherNodes) {
    const uri = node['@id'] ?? '';
    const sourceClassId = classUriToId.get(uri);
    const sourceInstanceId = instanceUriToId.get(uri);
    const sourceId = sourceClassId ?? sourceInstanceId;
    if (!sourceId) continue;

    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith('@')) continue;
      const relId = relationUriToId.get(key);
      if (!relId) continue;

      const targetUris = getIdRefs(val);
      for (const targetUri of targetUris) {
        const targetClassId = classUriToId.get(targetUri);
        const targetInstanceId = instanceUriToId.get(targetUri);
        const targetId = targetClassId ?? targetInstanceId;
        if (targetId) {
          result.edges.push({
            id: uuidv4(),
            relationTypeId: relId,
            sourceId,
            targetId,
            sourceKind: sourceClassId ? 'class' : 'instance',
            targetKind: targetClassId ? 'class' : 'instance',
          });
        }
      }
    }
  }

  return result;
}
