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
  CreateConstraintInput,
  UpdateConstraintInput,
  BatchRequestInput,
  BatchOperation,
  ValidateRequestInput,
  LlmChatRequestInput,
  Text2CypherRequestInput,
  ImportRequestInput,
  AssistRequestInput,
  AssistantActionResponse,
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

// ─── LLM Autocomplete (v4) ──────────────────────────────────
export interface AutocompleteRequest {
  type: 'class' | 'property' | 'relation';
  context: {
    classHierarchy: string;
    propertyMap: string;
    relationTypes: string;
    statistics: string;
  };
  currentInput: string;
  extra?: Record<string, string>;
}

export const llmAutocompleteApi = {
  suggest: (data: AutocompleteRequest) =>
    fetch('/api/llm/autocomplete', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse(r)),
};

// ─── Commits ───────────────────────────────────────────────
export const commitsApi = {
  list: (params?: { autoSave?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.autoSave != null) searchParams.set('autoSave', String(params.autoSave));
    const qs = searchParams.toString();
    return fetch(`/api/commits${qs ? `?${qs}` : ''}`).then((r) => handleResponse(r));
  },
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

export interface Neo4jQueryResponse {
  success: boolean;
  data: unknown[];
  columns: string[];
  rowCount: number;
  error?: string;
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
  query: (cypher: string) =>
    fetch('/api/neo4j/query', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ cypher }),
    }).then((r) => handleResponse<Neo4jQueryResponse>(r)),
};

// ─── Batch Operations (v3) ────────────────────────────────
export interface BatchResult {
  success: boolean;
  operationCount: number;
  results: Array<{
    index: number;
    type: string;
    action: string;
    success: boolean;
    id?: string;
    error?: string;
  }>;
}

export const batchApi = {
  execute: (data: BatchRequestInput): Promise<BatchResult> =>
    fetch('/api/batch', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse<BatchResult>(r)),
};

// ─── Constraints (v3) ─────────────────────────────────────
export const constraintsApi = {
  list: (params?: { constraintType?: string; sourceClassId?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.constraintType) searchParams.set('constraintType', params.constraintType);
    if (params?.sourceClassId) searchParams.set('sourceClassId', params.sourceClassId);
    const qs = searchParams.toString();
    return fetch(`/api/constraints${qs ? `?${qs}` : ''}`).then((r) =>
      handleResponse(r),
    );
  },
  get: (id: string) =>
    fetch(`/api/constraints/${id}`).then((r) => handleResponse(r)),
  create: (data: CreateConstraintInput) =>
    fetch('/api/constraints', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse(r)),
  update: (id: string, data: UpdateConstraintInput) =>
    fetch(`/api/constraints/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse(r)),
  delete: (id: string) =>
    fetch(`/api/constraints/${id}`, { method: 'DELETE' }).then((r) =>
      handleResponse(r),
    ),
};

// ─── Validation (v3) ──────────────────────────────────────
export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  ruleCode: string;
  message: string;
  targetTable: string;
  targetId: string;
  constraintId?: string;
}

export interface ValidationResult {
  runId: string;
  summary: {
    total: number;
    errors: number;
    warnings: number;
    infos: number;
  };
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  infos: ValidationIssue[];
}

export const validateApi = {
  run: (data?: ValidateRequestInput): Promise<ValidationResult> =>
    fetch('/api/validate', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data ?? {}),
    }).then((r) => handleResponse<ValidationResult>(r)),
};

// ─── LLM Chat (v3) ───────────────────────────────────────
export const llmChatApi = {
  stream: async (data: LlmChatRequestInput): Promise<ReadableStream<Uint8Array>> => {
    const res = await fetch('/api/llm/chat', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error ?? 'Chat request failed');
    }
    if (!res.body) {
      throw new Error('No response body');
    }
    return res.body;
  },
};

// ─── Text2Cypher (v3) ────────────────────────────────────
export interface Text2CypherResult {
  question: string;
  cypher: string;
  explanation: string;
  executed: boolean;
  results?: unknown[];
  error?: string;
}

export const text2CypherApi = {
  generate: (data: Text2CypherRequestInput): Promise<Text2CypherResult> =>
    fetch('/api/llm/text2cypher', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse<Text2CypherResult>(r)),
};

// ─── AI Assistant structured actions (P0-1) ───────────────
export const assistApi = {
  send: (data: AssistRequestInput): Promise<AssistantActionResponse> =>
    fetch('/api/llm/assist', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse<AssistantActionResponse>(r)),
};

// ─── Health Dashboard (P0-3) ──────────────────────────────
export interface HealthMetrics {
  classes: number;
  instances: number;
  edges: number;
  orphanNodes: number;
  emptyClasses: number;
  duplicateCandidates: number;
  coverage: number;
  unpushedChanges: number;
}

export const healthApi = {
  get: (): Promise<{ metrics: HealthMetrics }> =>
    fetch('/api/health').then((r) => handleResponse<{ metrics: HealthMetrics }>(r)),
};

// ─── Entity Resolution (P0-2) ─────────────────────────────
export interface MergeCandidate {
  id: string;
  kind: 'class' | 'instance';
  a: { id: string; name: string };
  b: { id: string; name: string };
  score: number;
  reason: string;
}

export const entityResolutionApi = {
  candidates: (): Promise<{ candidates: MergeCandidate[] }> =>
    fetch('/api/entity-resolution/candidates').then((r) =>
      handleResponse<{ candidates: MergeCandidate[] }>(r),
    ),
};

// ─── Import / Export (v3 + v4 JSON-LD / Turtle) ──────────
export type ExportFormat = 'json' | 'jsonld' | 'turtle' | 'owl';

export interface ExportResult {
  version: string;
  exportedAt: string;
  ontology: Record<string, unknown[]>;
  stats: Record<string, number>;
}

export interface ImportResult {
  success: boolean;
  strategy: string;
  format?: string;
  stats: Record<string, number>;
}

const FORMAT_META: Record<ExportFormat, { extension: string; contentType: string }> = {
  json: { extension: 'json', contentType: 'application/json' },
  jsonld: { extension: 'jsonld', contentType: 'application/ld+json' },
  turtle: { extension: 'ttl', contentType: 'text/turtle' },
  owl: { extension: 'owl', contentType: 'application/rdf+xml' },
};

export const importExportApi = {
  /** Fetch export as parsed JSON (only works for format=json) */
  exportOntology: (): Promise<ExportResult> =>
    fetch('/api/export').then((r) => handleResponse<ExportResult>(r)),

  /** Download export as a file in the specified format */
  exportAsFile: async (format: ExportFormat = 'json'): Promise<void> => {
    const res = await fetch(`/api/export?format=${format}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(data.error ?? 'Export failed');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const meta = FORMAT_META[format];
    a.download = `ontology-export-${new Date().toISOString().slice(0, 10)}.${meta.extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /** Import from structured JSON (original format) */
  importOntology: (data: ImportRequestInput): Promise<ImportResult> =>
    fetch('/api/import', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => handleResponse<ImportResult>(r)),

  /**
   * Import from a file. Auto-detects format by file extension:
   * - .json -> JSON import
   * - .jsonld -> JSON-LD import
   * - .ttl / .turtle -> Turtle import
   */
  importFromFile: async (
    file: File,
    strategy: 'replace' | 'merge' = 'replace',
  ): Promise<ImportResult> => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    // JSON-LD
    if (ext === 'jsonld') {
      const text = await file.text();
      const jsonLdDoc = JSON.parse(text);
      jsonLdDoc._strategy = strategy;
      return fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/ld+json' },
        body: JSON.stringify(jsonLdDoc),
      }).then((r) => handleResponse<ImportResult>(r));
    }

    // Turtle
    if (ext === 'ttl' || ext === 'turtle') {
      const text = await file.text();
      return fetch(`/api/import?strategy=${strategy}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/turtle' },
        body: text,
      }).then((r) => handleResponse<ImportResult>(r));
    }

    // Default: JSON
    const text = await file.text();
    const json = JSON.parse(text);
    return fetch('/api/import', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ ...json, strategy }),
    }).then((r) => handleResponse<ImportResult>(r));
  },
};
