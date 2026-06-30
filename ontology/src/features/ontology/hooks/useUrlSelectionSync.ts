'use client';

import { useEffect, useRef } from 'react';
import { useOntologyStore } from './useOntologyStore';

// 선택 노드를 URL(?node=<id>&type=<class|instance>)과 동기화한다.
// - 진입 시: URL 의 노드를 데이터 로드 후 한 번 선택·포커스(딥링크/새로고침 보존·공유).
// - 선택 변경 시: history.replaceState 로 URL 만 갱신(Next 라우터 재렌더·히스토리 스팸 없음).
// 스토어/비즈니스 로직은 건드리지 않고 기존 selectNode/focusNode 만 호출하는 표시·동기화 계층.
export function useUrlSelectionSync(): void {
  const selectedNodeId = useOntologyStore((s) => s.selectedNodeId);
  const selectedNodeType = useOntologyStore((s) => s.selectedNodeType);
  const selectNode = useOntologyStore((s) => s.selectNode);
  const focusNode = useOntologyStore((s) => s.focusNode);
  const classes = useOntologyStore((s) => s.classes);
  const instances = useOntologyStore((s) => s.instances);

  // 진입 시 URL 에서 읽은 "원하는 선택". 데이터가 준비되면 한 번만 적용.
  const desiredRef = useRef<{ id: string; type: 'class' | 'instance' } | null>(null);
  const appliedInitial = useRef(false);

  // 1) 마운트 시 URL 파싱.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('node');
    const type = params.get('type');
    if (id && (type === 'class' || type === 'instance')) {
      desiredRef.current = { id, type };
    }
  }, []);

  // 2) 데이터가 도착해 해당 노드가 존재하면 한 번 선택·포커스.
  useEffect(() => {
    if (appliedInitial.current) return;
    const desired = desiredRef.current;
    if (!desired) {
      appliedInitial.current = true;
      return;
    }
    const exists =
      desired.type === 'class'
        ? classes.some((c) => c.id === desired.id)
        : instances.some((i) => i.id === desired.id);
    if (exists) {
      selectNode(desired.id, desired.type);
      focusNode(desired.id);
      appliedInitial.current = true;
      return;
    }
    // 폴백: 데이터가 도착했는데도 노드가 없으면(삭제된 딥링크) 한 번만 시도하고 포기.
    // 그러지 않으면 appliedInitial 이 영원히 false 로 남아 effect #3 의 URL 동기화가 세션 내내 막힌다.
    if (classes.length > 0 || instances.length > 0) {
      appliedInitial.current = true;
    }
  }, [classes, instances, selectNode, focusNode]);

  // 3) 선택 변경을 URL 에 반영. 초기 딥링크가 아직 적용 전이면 덮어쓰지 않는다.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!appliedInitial.current && desiredRef.current) return;
    const url = new URL(window.location.href);
    if (selectedNodeId && selectedNodeType) {
      url.searchParams.set('node', selectedNodeId);
      url.searchParams.set('type', selectedNodeType);
    } else {
      url.searchParams.delete('node');
      url.searchParams.delete('type');
    }
    window.history.replaceState(window.history.state, '', url.toString());
  }, [selectedNodeId, selectedNodeType]);
}
