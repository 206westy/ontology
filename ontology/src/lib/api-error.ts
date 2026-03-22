import { NextResponse } from 'next/server';

// ─── Error Source Classification ────────────────────────────

export type ErrorSource = 'supabase' | 'llm' | 'neo4j' | 'validation' | 'unknown';

export interface ApiErrorResponse {
  error: string;
  code?: string;
  source?: ErrorSource;
  suggestion?: string;
  detail?: string;
}

// ─── Type Guards ────────────────────────────────────────────

interface DbError {
  code?: string;
  message?: string;
  detail?: string;
}

function isDbError(err: unknown): err is DbError {
  return typeof err === 'object' && err !== null && 'code' in err;
}

interface Neo4jError {
  code?: string;
  message?: string;
  name?: string;
}

function isNeo4jError(err: unknown): err is Neo4jError {
  if (typeof err !== 'object' || err === null) return false;
  const name = (err as { name?: string }).name ?? '';
  return (
    name === 'Neo4jError' ||
    name.startsWith('Neo4j') ||
    (typeof (err as Neo4jError).code === 'string' &&
      (err as Neo4jError).code!.startsWith('Neo.'))
  );
}

interface LlmError {
  status?: number;
  message?: string;
  code?: string;
  type?: string;
}

function isLlmError(err: unknown): err is LlmError {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as LlmError;
  return (
    e.type === 'api_error' ||
    e.type === 'authentication_error' ||
    e.type === 'rate_limit_error' ||
    e.type === 'invalid_request_error' ||
    (typeof e.status === 'number' && typeof e.message === 'string' && e.status >= 400)
  );
}

// ─── Supabase / Database Errors ─────────────────────────────

function handleDbError(err: DbError): NextResponse<ApiErrorResponse> {
  if (err.code === '23505') {
    return NextResponse.json(
      {
        error: '같은 이름의 항목이 이미 존재합니다.',
        code: '23505',
        source: 'supabase' as ErrorSource,
        suggestion: '다른 이름을 사용하거나, 기존 항목을 수정해주세요.',
      },
      { status: 409 },
    );
  }

  if (err.code === '23503') {
    return NextResponse.json(
      {
        error: '참조하는 항목이 존재하지 않습니다.',
        code: '23503',
        source: 'supabase' as ErrorSource,
        suggestion: '연결하려는 대상이 삭제되었을 수 있습니다. 새로고침 후 다시 시도해주세요.',
      },
      { status: 400 },
    );
  }

  if (err.code === '42P01') {
    return NextResponse.json(
      {
        error: '데이터 테이블을 찾을 수 없습니다.',
        code: '42P01',
        source: 'supabase' as ErrorSource,
        suggestion: '데이터베이스 마이그레이션이 필요할 수 있습니다. 관리자에게 문의해주세요.',
      },
      { status: 500 },
    );
  }

  // Connection errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
    return NextResponse.json(
      {
        error: '연결이 불안정합니다. 변경사항은 로컬에 보관됩니다.',
        code: err.code,
        source: 'supabase' as ErrorSource,
        suggestion: '네트워크 연결을 확인하고 잠시 후 다시 시도해주세요.',
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      error: '데이터 처리 중 오류가 발생했습니다.',
      code: err.code,
      source: 'supabase' as ErrorSource,
      suggestion: '잠시 후 다시 시도해주세요.',
      detail: err.message,
    },
    { status: 500 },
  );
}

// ─── Neo4j Errors ───────────────────────────────────────────

function handleNeo4jError(err: Neo4jError): NextResponse<ApiErrorResponse> {
  const code = err.code ?? '';

  if (code.includes('ConstraintValidation')) {
    return NextResponse.json(
      {
        error: '중복된 데이터가 Neo4j에 존재합니다.',
        code,
        source: 'neo4j' as ErrorSource,
        suggestion: '같은 ID의 노드가 이미 있을 수 있습니다. 기존 데이터를 확인해주세요.',
      },
      { status: 409 },
    );
  }

  if (code.includes('EntityNotFound')) {
    return NextResponse.json(
      {
        error: 'Neo4j에서 대상 노드를 찾을 수 없습니다.',
        code,
        source: 'neo4j' as ErrorSource,
        suggestion: '수정/삭제하려는 대상이 Neo4j에 존재하지 않습니다. 전체 푸시를 다시 시도해주세요.',
      },
      { status: 404 },
    );
  }

  if (code.includes('Security') || code.includes('Authentication')) {
    return NextResponse.json(
      {
        error: 'Neo4j 인증에 실패했습니다.',
        code,
        source: 'neo4j' as ErrorSource,
        suggestion: 'Neo4j 연결 설정(사용자명/비밀번호)을 확인해주세요.',
      },
      { status: 401 },
    );
  }

  if (code.includes('ServiceUnavailable') || err.message?.includes('connection')) {
    return NextResponse.json(
      {
        error: 'Neo4j 서버에 연결할 수 없습니다.',
        code,
        source: 'neo4j' as ErrorSource,
        suggestion: 'Neo4j가 실행 중인지 확인해주세요. 변경사항은 스테이징에 안전하게 보존되어 있습니다.',
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      error: '프로덕션 반영 중 오류가 발생했습니다.',
      code,
      source: 'neo4j' as ErrorSource,
      suggestion: '오류 내용을 확인 후 다시 시도해주세요. 변경사항은 스테이징에 안전하게 보존되어 있습니다.',
      detail: err.message,
    },
    { status: 500 },
  );
}

// ─── LLM Errors ─────────────────────────────────────────────

function handleLlmError(err: LlmError): NextResponse<ApiErrorResponse> {
  if (err.type === 'authentication_error' || err.status === 401) {
    return NextResponse.json(
      {
        error: 'AI 서비스 인증에 실패했습니다.',
        source: 'llm' as ErrorSource,
        suggestion: 'API 키 설정을 확인해주세요.',
      },
      { status: 401 },
    );
  }

  if (err.type === 'rate_limit_error' || err.status === 429) {
    return NextResponse.json(
      {
        error: 'AI 요청 한도를 초과했습니다.',
        source: 'llm' as ErrorSource,
        suggestion: '잠시 후 다시 시도해주세요. 또는 직접 입력하시겠습니까?',
      },
      { status: 429 },
    );
  }

  if (err.status === 503 || err.status === 500) {
    return NextResponse.json(
      {
        error: 'AI 구조화에 실패했습니다.',
        source: 'llm' as ErrorSource,
        suggestion: '잠시 후 다시 시도해주세요. 직접 입력하시겠습니까?',
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      error: 'AI 구조화에 실패했습니다.',
      source: 'llm' as ErrorSource,
      suggestion: '직접 입력하시겠습니까?',
      detail: err.message,
    },
    { status: 500 },
  );
}

// ─── Unified Error Handler ──────────────────────────────────

export function handleApiError(err: unknown): NextResponse<ApiErrorResponse> {
  // Neo4j errors (check before DB errors since both may have `code`)
  if (isNeo4jError(err)) {
    return handleNeo4jError(err);
  }

  // LLM API errors
  if (isLlmError(err)) {
    return handleLlmError(err);
  }

  // Supabase / Database errors
  if (isDbError(err)) {
    return handleDbError(err);
  }

  // Generic errors
  return NextResponse.json(
    {
      error: '알 수 없는 오류가 발생했습니다.',
      source: 'unknown' as ErrorSource,
      suggestion: '잠시 후 다시 시도해주세요.',
      detail: err instanceof Error ? err.message : undefined,
    },
    { status: 500 },
  );
}
