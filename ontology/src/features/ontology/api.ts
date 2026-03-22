import type {
  CreateClassInput,
  UpdateClassInput,
  CreatePropertyInput,
  UpdatePropertyInput,
  CreateInstanceInput,
  UpdateInstanceInput,
  CreateEdgeInput,
  CreateRelationTypeInput,
  UpdateRelationTypeInput,
  CreateAxiomInput,
  UpdateAxiomInput,
  CreateCommitInput,
  CreateInstanceValueInput,
} from './lib/schemas';

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.formErrors?.[0] ?? data.error ?? 'Request failed');
  }
  return data as T;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

// ─── Classes ───────────────────────────────────────────────
export const classesApi = {
  list: (parentId?: string) => {
    const params = parentId ? `?parentId=${parentId}` : '';
    return fetch(`/api/classes${params}`).then((r) => handleResponse(r));
  },
  get: (id: string) =>
    fetch(`/api/classes/${id}`).then((r) => handleResponse(r)),
  create: (data: CreateClassInput) =>
    fetch('/api/classes', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse(r)),
  update: (id: string, data: UpdateClassInput) =>
    fetch(`/api/classes/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse(r)),
  delete: (id: string) =>
    fetch(`/api/classes/${id}`, { method: 'DELETE' }).then((r) =>
      handleResponse(r),
    ),
};

// ─── Properties ────────────────────────────────────────────
export const propertiesApi = {
  list: (classId?: string) => {
    const params = classId ? `?classId=${classId}` : '';
    return fetch(`/api/properties${params}`).then((r) => handleResponse(r));
  },
  create: (data: CreatePropertyInput) =>
    fetch('/api/properties', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse(r)),
  update: (id: string, data: UpdatePropertyInput) =>
    fetch(`/api/properties/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse(r)),
  delete: (id: string) =>
    fetch(`/api/properties/${id}`, { method: 'DELETE' }).then((r) =>
      handleResponse(r),
    ),
};

// ─── Instances ─────────────────────────────────────────────
export const instancesApi = {
  list: (classId?: string) => {
    const params = classId ? `?classId=${classId}` : '';
    return fetch(`/api/instances${params}`).then((r) => handleResponse(r));
  },
  create: (data: CreateInstanceInput) =>
    fetch('/api/instances', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse(r)),
  update: (id: string, data: UpdateInstanceInput) =>
    fetch(`/api/instances/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse(r)),
  delete: (id: string) =>
    fetch(`/api/instances/${id}`, { method: 'DELETE' }).then((r) =>
      handleResponse(r),
    ),
};

// ─── Edges ─────────────────────────────────────────────────
export const edgesApi = {
  list: (nodeId?: string) => {
    const params = nodeId ? `?nodeId=${nodeId}` : '';
    return fetch(`/api/edges${params}`).then((r) => handleResponse(r));
  },
  create: (data: CreateEdgeInput) =>
    fetch('/api/edges', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse(r)),
  delete: (id: string) =>
    fetch(`/api/edges?id=${id}`, { method: 'DELETE' }).then((r) =>
      handleResponse(r),
    ),
};

// ─── Relation Types ────────────────────────────────────────
export const relationTypesApi = {
  list: () => fetch('/api/relation-types').then((r) => handleResponse(r)),
  create: (data: CreateRelationTypeInput) =>
    fetch('/api/relation-types', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse(r)),
  update: (id: string, data: UpdateRelationTypeInput) =>
    fetch(`/api/relation-types/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse(r)),
  delete: (id: string) =>
    fetch(`/api/relation-types/${id}`, { method: 'DELETE' }).then((r) =>
      handleResponse(r),
    ),
};

// ─── Axioms ────────────────────────────────────────────────
export const axiomsApi = {
  list: () => fetch('/api/axioms').then((r) => handleResponse(r)),
  create: (data: CreateAxiomInput) =>
    fetch('/api/axioms', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse(r)),
  update: (id: string, data: UpdateAxiomInput) =>
    fetch(`/api/axioms/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse(r)),
  delete: (id: string) =>
    fetch(`/api/axioms/${id}`, { method: 'DELETE' }).then((r) =>
      handleResponse(r),
    ),
};

// ─── Instance Values ──────────────────────────────────────
export const instanceValuesApi = {
  upsert: (data: CreateInstanceValueInput) =>
    fetch('/api/instance-values', {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse(r)),
  delete: (instanceId: string, propertyId: string) =>
    fetch('/api/instance-values', {
      method: 'DELETE',
      headers: jsonHeaders,
      body: JSON.stringify({ instanceId, propertyId }),
    }).then((r) => handleResponse(r)),
};

// ─── LLM ──────────────────────────────────────────────────
export interface LlmParseInput {
  text: string;
  existingClasses?: string[];
  existingRelationTypes?: string[];
}

export interface LlmParseResult {
  classes: { name: string; description: string; color: string | null; parentName: string | null }[];
  properties: { className: string; name: string; dataType: string; isRequired: boolean; enumValues: string[] | null }[];
  relations: { sourceName: string; targetName: string; relationName: string }[];
  instances: { className: string; name: string }[];
}

export const llmApi = {
  parse: (data: LlmParseInput): Promise<LlmParseResult> =>
    fetch('/api/llm/parse', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse<LlmParseResult>(r)),
};

// ─── Commits ───────────────────────────────────────────────
export const commitsApi = {
  list: () => fetch('/api/commits').then((r) => handleResponse(r)),
  create: (data: CreateCommitInput) =>
    fetch('/api/commits', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse(r)),
};

// ─── Neo4j ────────────────────────────────────────────────
export interface Neo4jPushStep {
  index: number;
  total: number;
  description: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

export interface Neo4jPushResponse {
  success: boolean;
  commitIds: string[];
  steps: Neo4jPushStep[];
  cypherPreview?: string;
  error?: string;
  suggestion?: string;
}

export interface Neo4jStatusResponse {
  connected: boolean;
  serverInfo?: { version: string; edition: string };
  error?: string;
  suggestion?: string;
}

export const neo4jApi = {
  status: () =>
    fetch('/api/neo4j/status').then((r) => handleResponse<Neo4jStatusResponse>(r)),
  push: (data: { commitIds: string[]; dryRun?: boolean }) =>
    fetch('/api/neo4j/push', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse<Neo4jPushResponse>(r)),
};
