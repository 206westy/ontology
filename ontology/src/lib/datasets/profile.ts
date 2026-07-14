// PRD-PF-D M3: CSV 컬럼 프로파일링(순수·결정론). 5만 행 샘플링 상한, 자동 정제 없음(진단만).

export type DataType =
  | 'string'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'unknown';

export interface ColumnProfile {
  name: string;
  ordinalPosition: number;
  dataType: DataType;
  nullable: boolean;
  missingRate: number;
  distinctCount: number;
  sampleValues: string[];
  minValue: string | null;
  maxValue: string | null;
  enumValues: string[] | null;
}

export interface CsvProfile {
  rowCount: number;
  sampledRows: number;
  columns: ColumnProfile[];
  checksum: string;
}

export const PROFILE_ROW_CAP = 50_000;
const ENUM_MAX_DISTINCT = 20;
const SAMPLE_LIMIT = 5;

const INT_RE = /^-?\d+$/;
const FLOAT_RE = /^-?\d*\.\d+$/;
const BOOL_RE = /^(true|false|yes|no|y|n|0|1)$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;

/**
 * 최소 RFC4180 CSV 파서(따옴표·이스케이프·개행 포함 필드 처리). 의존성 없음.
 */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  // 마지막 필드/행 flush(트레일링 개행 없을 때).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  const headers = nonEmpty.length > 0 ? nonEmpty[0].map((h) => h.trim()) : [];
  return { headers, rows: nonEmpty.slice(1) };
}

function inferType(values: string[]): DataType {
  const nonEmpty = values.filter((v) => v.trim() !== '');
  if (nonEmpty.length === 0) return 'unknown';
  const all = (re: RegExp) => nonEmpty.every((v) => re.test(v.trim()));
  if (all(INT_RE)) return 'integer';
  if (all(FLOAT_RE) || nonEmpty.every((v) => INT_RE.test(v.trim()) || FLOAT_RE.test(v.trim())))
    return 'float';
  if (all(BOOL_RE)) return 'boolean';
  if (all(DATETIME_RE)) return 'datetime';
  if (all(DATE_RE)) return 'date';
  return 'string';
}

function minMax(values: string[], type: DataType): { min: string | null; max: string | null } {
  const nonEmpty = values.filter((v) => v.trim() !== '');
  if (nonEmpty.length === 0) return { min: null, max: null };
  if (type === 'integer' || type === 'float') {
    const nums = nonEmpty.map(Number).filter((n) => !Number.isNaN(n));
    if (nums.length === 0) return { min: null, max: null };
    return { min: String(Math.min(...nums)), max: String(Math.max(...nums)) };
  }
  const sorted = [...nonEmpty].sort();
  return { min: sorted[0], max: sorted[sorted.length - 1] };
}

// djb2 — provenance/결정론 해시(기존 input_hash 와 동일 계열).
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

/** 헤더 + 컬럼 프로파일 → 스키마·표본 요약을 CSV 텍스트로 프로파일링. */
export function profileCsv(text: string): CsvProfile {
  const { headers, rows } = parseCsv(text);
  const rowCount = rows.length;
  const sampled = rows.slice(0, PROFILE_ROW_CAP);

  const columns: ColumnProfile[] = headers.map((name, col) => {
    const values = sampled.map((r) => r[col] ?? '');
    const nonEmpty = values.filter((v) => v.trim() !== '');
    const missing = values.length - nonEmpty.length;
    const distinct = new Set(nonEmpty.map((v) => v.trim()));
    const dataType = inferType(values);
    const { min, max } = minMax(values, dataType);

    const distinctArr = Array.from(distinct);
    const isEnum =
      dataType === 'string' && distinct.size > 0 && distinct.size <= ENUM_MAX_DISTINCT;

    return {
      name,
      ordinalPosition: col,
      dataType: isEnum ? 'enum' : dataType,
      nullable: missing > 0,
      missingRate: values.length > 0 ? missing / values.length : 0,
      distinctCount: distinct.size,
      sampleValues: distinctArr.slice(0, SAMPLE_LIMIT),
      minValue: min,
      maxValue: max,
      enumValues: isEnum ? distinctArr.slice(0, ENUM_MAX_DISTINCT) : null,
    };
  });

  const checksum = djb2(
    headers.join('|') + '#' + columns.map((c) => `${c.name}:${c.dataType}`).join(','),
  );

  return { rowCount, sampledRows: sampled.length, columns, checksum };
}
