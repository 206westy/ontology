'use client';

import { create } from 'zustand';
import { DEFAULT_ONTOLOGY_ID } from '@/lib/authz/constants';

const STORAGE_KEY = 'active-ontology-id';

function readInitial(): string {
  if (typeof window === 'undefined') return DEFAULT_ONTOLOGY_ID;
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_ONTOLOGY_ID;
  } catch {
    return DEFAULT_ONTOLOGY_ID;
  }
}

interface ActiveOntologyState {
  /** 현재 편집 중인 온톨로지. 모든 `/api/*` 요청 헤더의 소스(api-client 래퍼). */
  activeOntologyId: string;
  setActiveOntologyId: (id: string) => void;
}

/**
 * PRD-PF-A: 클라이언트 활성 온톨로지 스토어(경량, localStorage 지속).
 * 그래프 편집 스토어(useOntologyStore)와 분리 — 온톨로지 전환은 그래프 상태 리셋을 유발하므로
 * 소비처(OntologySwitcher)가 명시적으로 리로드를 트리거한다.
 */
export const useActiveOntology = create<ActiveOntologyState>((set) => ({
  activeOntologyId: readInitial(),
  setActiveOntologyId: (id: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    set({ activeOntologyId: id });
  },
}));
