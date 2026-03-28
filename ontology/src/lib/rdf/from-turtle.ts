/**
 * Converts Turtle format back to internal ontology model using N3.Parser.
 *
 * Parses triples and categorizes nodes by their rdf:type.
 */

import { DEFAULT_NAMESPACE, RDF, RDFS, OWL, XSD_TO_DATA_TYPE } from './constants';
import { randomUUID } from 'crypto';

const uuidv4 = () => randomUUID();

interface InternalOntology {
  classes: Array<Record<string, unknown>>;
  properties: Array<Record<string, unknown>>;
  instances: Array<Record<string, unknown>>;
  instanceValues: Array<Record<string, unknown>>;
  relationTypes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

interface NodeData {
  types: string[];
  props: Map<string, string[]>;
}

export async function turtleToOntology(turtleStr: string): Promise<InternalOntology> {
  const N3 = await import(/* webpackIgnore: true */ 'n3');
  const store = new N3.Store();

  // Parse turtle into the store
  await new Promise<void>((resolve, reject) => {
    const parser = new N3.Parser();
    parser.parse(turtleStr, (error: Error | null, quad: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      if (quad) {
        store.addQuad(quad as any);
      } else {
        resolve();
      }
    });
  });

  const ns = DEFAULT_NAMESPACE;

  // Collect all subjects and their data
  const nodeMap = new Map<string, NodeData>();

  function getOrCreate(uri: string): NodeData {
    let data = nodeMap.get(uri);
    if (!data) {
      data = { types: [], props: new Map() };
      nodeMap.set(uri, data);
    }
    return data;
  }

  // Process all quads
  const quads = store.getQuads(null, null, null, null);
  for (const q of quads) {
    const subject = q.subject.value;
    const predicate = q.predicate.value;
    const objectVal = q.object.value;

    const node = getOrCreate(subject);

    if (predicate === `${RDF}type`) {
      node.types.push(objectVal);
    } else {
      const existing = node.props.get(predicate);
      if (existing) {
        existing.push(objectVal);
      } else {
        node.props.set(predicate, [objectVal]);
      }
    }
  }

  const result: InternalOntology = {
    classes: [],
    properties: [],
    instances: [],
    instanceValues: [],
    relationTypes: [],
    edges: [],
  };

  // URI -> internal ID
  const classUriToId = new Map<string, string>();
  const propertyUriToId = new Map<string, string>();
  const relationUriToId = new Map<string, string>();
  const instanceUriToId = new Map<string, string>();

  function extractId(uri: string, nodeData: NodeData): string {
    const internalIds = nodeData.props.get(`${ns}internalId`);
    if (internalIds && internalIds.length > 0) return internalIds[0];
    const segments = uri.split('/');
    const lastSegment = segments[segments.length - 1];
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lastSegment)) {
      return lastSegment;
    }
    return uuidv4();
  }

  function getFirst(nodeData: NodeData, predicate: string): string {
    const vals = nodeData.props.get(predicate);
    return vals && vals.length > 0 ? vals[0] : '';
  }

  function getFirstOrNull(nodeData: NodeData, predicate: string): string | null {
    const vals = nodeData.props.get(predicate);
    return vals && vals.length > 0 ? vals[0] : null;
  }

  // Pass 1: owl:Class
  for (const [uri, data] of nodeMap) {
    if (!data.types.includes(`${OWL}Class`)) continue;

    const id = extractId(uri, data);
    classUriToId.set(uri, id);

    const parentUri = getFirstOrNull(data, `${RDFS}subClassOf`);

    result.classes.push({
      id,
      name: getFirst(data, `${RDFS}label`),
      description: getFirst(data, `${RDFS}comment`),
      color: getFirst(data, `${ns}color`) || '#7c3aed',
      positionX: parseFloat(getFirst(data, `${ns}positionX`)) || 0,
      positionY: parseFloat(getFirst(data, `${ns}positionY`)) || 0,
      parentId: null,
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

  // Pass 2: owl:ObjectProperty -> relation types
  for (const [uri, data] of nodeMap) {
    if (!data.types.includes(`${OWL}ObjectProperty`)) continue;

    const id = extractId(uri, data);
    relationUriToId.set(uri, id);

    const domainUri = getFirstOrNull(data, `${RDFS}domain`);
    const rangeUri = getFirstOrNull(data, `${RDFS}range`);

    result.relationTypes.push({
      id,
      name: getFirst(data, `${RDFS}label`),
      description: getFirst(data, `${RDFS}comment`),
      sourceClassId: domainUri ? (classUriToId.get(domainUri) ?? null) : null,
      targetClassId: rangeUri ? (classUriToId.get(rangeUri) ?? null) : null,
    });
  }

  // Pass 3: owl:DatatypeProperty -> properties
  for (const [uri, data] of nodeMap) {
    if (!data.types.includes(`${OWL}DatatypeProperty`)) continue;

    const id = extractId(uri, data);
    propertyUriToId.set(uri, id);

    const domainUri = getFirstOrNull(data, `${RDFS}domain`);
    const rangeUri = getFirstOrNull(data, `${RDFS}range`);
    const dataType = rangeUri ? (XSD_TO_DATA_TYPE[rangeUri] ?? 'string') : 'string';

    const enumVals = data.props.get(`${ns}enumValues`) ?? [];

    result.properties.push({
      id,
      classId: domainUri ? (classUriToId.get(domainUri) ?? '') : '',
      name: getFirst(data, `${RDFS}label`),
      dataType: enumVals.length > 0 ? 'enum' : dataType,
      isRequired: getFirst(data, `${ns}isRequired`) === 'true',
      enumValues: enumVals.length > 0 ? enumVals : null,
      constraintRule: null,
      sortOrder: parseInt(getFirst(data, `${ns}sortOrder`), 10) || 0,
    });
  }

  // Pass 4: owl:NamedIndividual -> instances + instance values
  for (const [uri, data] of nodeMap) {
    if (!data.types.includes(`${OWL}NamedIndividual`)) continue;

    const id = extractId(uri, data);
    instanceUriToId.set(uri, id);

    // Find class type (non-NamedIndividual type that's a known class)
    const classType = data.types.find(
      (t) => t !== `${OWL}NamedIndividual` && classUriToId.has(t),
    );
    const classId = classType ? (classUriToId.get(classType) ?? '') : '';

    result.instances.push({
      id,
      classId,
      name: getFirst(data, `${RDFS}label`),
    });

    // Check all properties for value assignments and relations
    for (const [predicate, values] of data.props) {
      if (predicate === `${RDFS}label` || predicate === `${ns}internalId`) continue;
      if (predicate.startsWith(`${RDF}`) || predicate.startsWith(`${RDFS}`) || predicate.startsWith(`${OWL}`)) continue;
      if (predicate === `${ns}color` || predicate === `${ns}positionX` || predicate === `${ns}positionY`) continue;
      if (predicate === `${ns}isRequired` || predicate === `${ns}sortOrder` || predicate === `${ns}enumValues`) continue;

      const propId = propertyUriToId.get(predicate);
      if (propId) {
        for (const val of values) {
          result.instanceValues.push({
            id: uuidv4(),
            instanceId: id,
            propertyId: propId,
            value: val,
          });
        }
        continue;
      }

      const relId = relationUriToId.get(predicate);
      if (relId) {
        for (const targetUri of values) {
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

  // Pass 5: edges from class-level relations (non-categorized nodes or class nodes with relation predicates)
  for (const [uri, data] of nodeMap) {
    if (data.types.includes(`${OWL}NamedIndividual`)) continue; // already processed

    const sourceClassId = classUriToId.get(uri);
    if (!sourceClassId) continue;

    for (const [predicate, values] of data.props) {
      const relId = relationUriToId.get(predicate);
      if (!relId) continue;

      for (const targetUri of values) {
        const targetClassId = classUriToId.get(targetUri);
        const targetInstanceId = instanceUriToId.get(targetUri);
        const targetId = targetClassId ?? targetInstanceId;
        if (targetId) {
          result.edges.push({
            id: uuidv4(),
            relationTypeId: relId,
            sourceId: sourceClassId,
            targetId,
            sourceKind: 'class',
            targetKind: targetClassId ? 'class' : 'instance',
          });
        }
      }
    }
  }

  return result;
}
