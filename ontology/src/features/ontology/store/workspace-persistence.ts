'use client';

// 워크스페이스(구획) 선택값만 localStorage 에 유지한다.
// 온톨로지 데이터 자체는 Supabase 가 원본이므로 persist 하지 않는다 —
// 여기서는 "마지막으로 보던 구획"이라는 가벼운 뷰 상태만 살린다.
// 이렇게 해야 재접속 때마다 기본 구획으로 리셋되는 문제("계속 초기화되는 느낌")가 사라진다.

const STORAGE_KEY = 'ontology-workspace-selection';

export interface WorkspaceSelection {
  partitionId: string | null;
  showAll: boolean;
}

export function readWorkspaceSelection(): WorkspaceSelection | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkspaceSelection>;
    const partitionId =
      typeof parsed.partitionId === 'string' ? parsed.partitionId : null;
    const showAll = parsed.showAll === true;
    return { partitionId, showAll };
  } catch {
    return null;
  }
}

export function writeWorkspaceSelection(selection: WorkspaceSelection): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // quota/직렬화 실패는 무시 — 지속성은 편의 기능일 뿐 정확성에 영향 없음.
  }
}
