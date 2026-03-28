/**
 * RDF namespace constants and JSON-LD @context for Ontology Studio exports.
 */

export const DEFAULT_NAMESPACE = 'https://ontology.studio/ns/';

export const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
export const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
export const OWL = 'http://www.w3.org/2002/07/owl#';
export const XSD = 'http://www.w3.org/2001/XMLSchema#';

export const JSONLD_CONTEXT = {
  rdf: RDF,
  rdfs: RDFS,
  owl: OWL,
  xsd: XSD,
  os: DEFAULT_NAMESPACE,
  'os:color': { '@id': `${DEFAULT_NAMESPACE}color`, '@type': 'xsd:string' },
  'os:positionX': { '@id': `${DEFAULT_NAMESPACE}positionX`, '@type': 'xsd:float' },
  'os:positionY': { '@id': `${DEFAULT_NAMESPACE}positionY`, '@type': 'xsd:float' },
  'os:dataType': { '@id': `${DEFAULT_NAMESPACE}dataType`, '@type': 'xsd:string' },
  'os:isRequired': { '@id': `${DEFAULT_NAMESPACE}isRequired`, '@type': 'xsd:boolean' },
  'os:enumValues': { '@id': `${DEFAULT_NAMESPACE}enumValues` },
  'os:sortOrder': { '@id': `${DEFAULT_NAMESPACE}sortOrder`, '@type': 'xsd:integer' },
  'os:sourceKind': { '@id': `${DEFAULT_NAMESPACE}sourceKind`, '@type': 'xsd:string' },
  'os:targetKind': { '@id': `${DEFAULT_NAMESPACE}targetKind`, '@type': 'xsd:string' },
  'os:internalId': { '@id': `${DEFAULT_NAMESPACE}internalId`, '@type': 'xsd:string' },
};

/** Map our property dataType strings to XSD type URIs */
export const DATA_TYPE_TO_XSD: Record<string, string> = {
  string: `${XSD}string`,
  integer: `${XSD}integer`,
  float: `${XSD}float`,
  boolean: `${XSD}boolean`,
  date: `${XSD}date`,
  enum: `${XSD}string`,
};

/** Reverse map from XSD URI to internal dataType */
export const XSD_TO_DATA_TYPE: Record<string, string> = {
  [`${XSD}string`]: 'string',
  [`${XSD}integer`]: 'integer',
  [`${XSD}float`]: 'float',
  [`${XSD}boolean`]: 'boolean',
  [`${XSD}date`]: 'date',
};
