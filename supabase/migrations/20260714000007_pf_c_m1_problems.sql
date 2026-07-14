-- PRD-PF-C M1: 문제 최상위 스코프(problems) + 문제↔온톨로지 재사용 계보(problem_ontology_links).
-- 워크스페이스 스코프(테넌시 경계). 앱 계층 getWorkspaceScope 가 1차 방어, RLS 는 2차(서비스롤 우회).

-- ── problems ──────────────────────────────────────────────────
CREATE TABLE public.problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  goal_metric jsonb NOT NULL DEFAULT '{}'::jsonb,          -- {name,target,unit,direction}
  action_slots jsonb NOT NULL DEFAULT '[]'::jsonb,          -- [{key,label}]
  decision_questions jsonb NOT NULL DEFAULT '[]'::jsonb,    -- [{question,decision,sourcePatternId?}] (patterns.CQ 초안 복사)
  status text NOT NULL DEFAULT 'defining',
  workflow_state jsonb NOT NULL DEFAULT '{}'::jsonb,        -- {define,data,studio,functions,board: locked|draft|confirmed|stale + by/at}
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_problem_status CHECK (status IN ('defining','in_progress','completed','archived'))
);
CREATE INDEX idx_problems_workspace ON public.problems(workspace_id);

-- ── problem_ontology_links (문제당 다중 온톨로지 + 재사용 모드) ──
CREATE TABLE public.problem_ontology_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id uuid NOT NULL REFERENCES public.problems(id) ON DELETE CASCADE,
  ontology_id uuid NOT NULL REFERENCES public.ontologies(id) ON DELETE CASCADE,
  link_mode text NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pol_link_mode CHECK (link_mode IN ('new','reuse','extend','branch'))
);
CREATE INDEX idx_pol_problem ON public.problem_ontology_links(problem_id);
CREATE INDEX idx_pol_ontology ON public.problem_ontology_links(ontology_id);

-- ── RLS(멤버십 스코프, deny-all 기본 + authenticated 멤버 허용) ──
ALTER TABLE public.problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problem_ontology_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY problems_member_all ON public.problems
  FOR ALL TO authenticated
  USING (public.user_has_workspace_access(workspace_id))
  WITH CHECK (public.user_has_workspace_access(workspace_id));

CREATE POLICY pol_member_all ON public.problem_ontology_links
  FOR ALL TO authenticated
  USING (public.user_has_ontology_access(ontology_id))
  WITH CHECK (public.user_has_ontology_access(ontology_id));
