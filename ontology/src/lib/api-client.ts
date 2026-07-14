'use client';

import { useActiveOntology } from '@/features/workspace/hooks/useActiveOntology';
import { ONTOLOGY_HEADER, DEFAULT_ONTOLOGY_ID } from '@/lib/authz/constants';

let installed = false;

/**
 * PRD-PF-A: 클라이언트 fetch 래퍼.
 *
 * 앱의 모든 API 호출은 상대경로 `/api/*` bare fetch 다(중앙 클라이언트 없음).
 * 매 호출부를 고치는 대신 window.fetch 를 1회 래핑해 활성 온톨로지를
 * `x-ontology-id` 헤더로 주입한다 → 서버 `getOntologyScope` 가 스코프를 확정.
 * 외부 절대 URL(OpenAI 등, 서버측 호출)은 건드리지 않는다.
 */
export function installOntologyFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const original = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.pathname
            : (input as Request).url;

      if (url && url.startsWith('/api/')) {
        const ontologyId =
          useActiveOntology.getState().activeOntologyId || DEFAULT_ONTOLOGY_ID;
        const headers = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined),
        );
        if (!headers.has(ONTOLOGY_HEADER)) {
          headers.set(ONTOLOGY_HEADER, ontologyId);
        }
        return original(input, { ...init, headers });
      }
    } catch {
      /* 어떤 이유로든 실패하면 원본 fetch 로 폴백 */
    }
    return original(input as RequestInfo | URL, init);
  };
}
