import type { DataType } from '@/lib/datasets/profile';
import type { CreateMappingInput } from './schemas';

export interface DatasetListItem {
  id: string;
  name: string;
  description: string;
  status: string;
  rowCount: number | null;
  checksum: string | null;
  columnCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetColumn {
  id: string;
  datasetId: string;
  name: string;
  ordinalPosition: number;
  dataType: DataType;
  nullable: boolean;
  missingRate: number | null;
  distinctCount: number | null;
  sampleValues: string[];
  minValue: string | null;
  maxValue: string | null;
  enumValues: string[] | null;
}

export interface ColumnMapping {
  id: string;
  datasetColumnId: string;
  ontologyId: string;
  targetType: 'class' | 'property';
  targetClassId: string | null;
  targetPropertyId: string | null;
  confidence: number | null;
  source: 'user' | 'embedding_suggested';
}

export interface DatasetDetail extends DatasetListItem {
  columns: DatasetColumn[];
  mappings: ColumnMapping[];
  referencedBy: { problemId: string; title: string | null; role: string }[];
}

export interface ProblemDatasetLink {
  id: string;
  datasetId: string;
  datasetName: string | null;
  rowCount: number | null;
  status: string | null;
  role: string;
  attachedAt: string;
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok)
    throw new Error(data.error?.formErrors?.[0] ?? data.error ?? '요청 실패');
  return data as T;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

export const datasetsApi = {
  list: (): Promise<DatasetListItem[]> =>
    fetch('/api/datasets').then((r) => json<DatasetListItem[]>(r)),

  get: (id: string): Promise<DatasetDetail> =>
    fetch(`/api/datasets/${id}`).then((r) => json<DatasetDetail>(r)),

  registerCsv: (data: {
    name: string;
    description?: string;
    csvText: string;
  }): Promise<DatasetListItem & { sampledRows: number }> =>
    fetch('/api/datasets', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => json(r)),

  remove: (id: string): Promise<{ success: boolean }> =>
    fetch(`/api/datasets/${id}`, { method: 'DELETE' }).then((r) => json(r)),

  // 원본 재업로드로 스키마 드리프트 감지(체크섬 비교 → stale). 비파괴.
  refresh: (
    id: string,
    csvText: string,
  ): Promise<{
    drifted: boolean;
    addedColumns: string[];
    removedColumns: string[];
    rowCount: number;
    status: string;
  }> =>
    fetch(`/api/datasets/${id}/refresh`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ csvText }),
    }).then((r) => json(r)),

  listMappings: (id: string): Promise<ColumnMapping[]> =>
    fetch(`/api/datasets/${id}/mappings`).then((r) => json<ColumnMapping[]>(r)),

  createMapping: (id: string, data: CreateMappingInput): Promise<ColumnMapping> =>
    fetch(`/api/datasets/${id}/mappings`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => json<ColumnMapping>(r)),

  listForProblem: (problemId: string): Promise<ProblemDatasetLink[]> =>
    fetch(`/api/problems/${problemId}/datasets`).then((r) => json<ProblemDatasetLink[]>(r)),

  attachToProblem: (
    problemId: string,
    data: { datasetId: string; role?: 'primary' | 'reference' },
  ): Promise<ProblemDatasetLink> =>
    fetch(`/api/problems/${problemId}/datasets`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }).then((r) => json<ProblemDatasetLink>(r)),
};
