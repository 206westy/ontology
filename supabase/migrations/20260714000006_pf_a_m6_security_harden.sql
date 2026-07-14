-- PRD-PF-A M6: 보안 어드바이저 하드닝(내 변경분).
-- (1) 드리프트 트리거 함수 search_path 고정(mutable search_path 경고 해소).
ALTER FUNCTION public.check_class_ontology_partition_match() SET search_path = public;

-- (2) 접근판정 SECURITY DEFINER 함수: anon RPC 실행 노출 차단.
--     RLS 정책이 authenticated 로 평가 시엔 EXECUTE 가 필요하므로 authenticated 만 유지.
REVOKE EXECUTE ON FUNCTION public.user_has_ontology_access(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_has_workspace_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_ontology_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_workspace_access(uuid) TO authenticated;
