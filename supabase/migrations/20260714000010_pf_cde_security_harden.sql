-- PRD-PF C~E 하드닝: 접근판정 SECURITY DEFINER 함수의 anon RPC 실행 노출 차단.
-- pf_a_m6 는 PUBLIC 만 revoke 했으나 Supabase 기본권한이 부여한 anon 개별 grant 가 남아 있었다.
-- 앱은 service_role 로 동작하고 RLS 는 authenticated 로 평가하므로 anon 회수는 무영향.
REVOKE EXECUTE ON FUNCTION public.user_has_ontology_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_has_workspace_access(uuid) FROM anon;
