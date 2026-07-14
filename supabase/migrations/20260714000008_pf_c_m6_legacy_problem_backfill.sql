-- PRD-PF-C M6: 기존 전역 그래프를 워크플로우 뷰에서 문제 1건(legacy-default)으로 대표한다.
-- `/`(스튜디오 단독판)는 변경하지 않는다(두-버전 결정) — 이 문제는 /problems 목록에서만 노출.
INSERT INTO public.problems (id, workspace_id, title, description, status, workflow_state, created_by)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  '기존 온톨로지',
  '스튜디오 단독판에서 만들어 온 기존 그래프입니다. 문제 단위로 이어서 작업할 수 있습니다.',
  'in_progress',
  '{"define":{"state":"confirmed"},"data":{"state":"draft"},"studio":{"state":"draft"},"functions":{"state":"locked"},"board":{"state":"locked"}}'::jsonb,
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- 기본 온톨로지를 reuse 모드로 연결(주 온톨로지). 재실행 안전(WHERE NOT EXISTS).
INSERT INTO public.problem_ontology_links (problem_id, ontology_id, link_mode, is_primary)
SELECT
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  'reuse',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.problem_ontology_links
  WHERE problem_id = '33333333-3333-3333-3333-333333333333'
    AND ontology_id = '22222222-2222-2222-2222-222222222222'
);
