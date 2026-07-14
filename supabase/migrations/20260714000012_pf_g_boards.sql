-- PRD-PF-G: 대시보드(모니터링)·액션보드(처리 큐). 결정함수/SPC 판정을 사람이 소비하는 화면.
-- 스코프: ontology_id(PF-A 완료 → partition_id 임시안 상향) + 멤버십 RLS. 문제 보드뷰는 problem_id(nullable).
-- 완전자동 금지: action_items 상태전이는 resolved_by+resolution_note 없이는 API/DB 레벨에서 불가.

-- ── dashboards (뷰 빌더로 조립하는 모니터링 화면) ──
CREATE TABLE public.dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ontology_id uuid NOT NULL REFERENCES public.ontologies(id) ON DELETE CASCADE,
  problem_id uuid REFERENCES public.problems(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dashboards_ontology ON public.dashboards(ontology_id);
CREATE INDEX idx_dashboards_problem ON public.dashboards(problem_id);

-- ── dashboard_widgets (라이브러리 중립 config → 렌더러 어댑터가 ECharts로) ──
CREATE TABLE public.dashboard_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  widget_type text NOT NULL,
  title text NOT NULL DEFAULT '',
  source_kind text NOT NULL,
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  position jsonb NOT NULL DEFAULT '{}'::jsonb,
  refresh_interval_s integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_widget_type CHECK (widget_type IN ('control_chart','trend','histogram','kpi_card','anomaly_list')),
  CONSTRAINT chk_widget_source CHECK (source_kind IN ('decision_function','spc_series','instance_property'))
);
CREATE INDEX idx_widgets_dashboard ON public.dashboard_widgets(dashboard_id);

-- ── action_items (처리 큐: 불통과/이상 판정만) ──
CREATE TABLE public.action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ontology_id uuid NOT NULL REFERENCES public.ontologies(id) ON DELETE CASCADE,
  problem_id uuid REFERENCES public.problems(id) ON DELETE SET NULL,
  source_function_id uuid REFERENCES public.functions(id) ON DELETE SET NULL,
  subject_instance_id uuid REFERENCES public.instances(id) ON DELETE SET NULL,
  verdict text NOT NULL,
  score real,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  assigned_to uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_action_verdict CHECK (verdict IN ('fail','warn','pass')),
  CONSTRAINT chk_action_status CHECK (status IN ('pending','in_review','confirmed','dismissed')),
  -- ★완전자동 금지★: 확정/기각은 반드시 행위자+사유 동반(감사추적 스키마 강제).
  CONSTRAINT chk_action_resolution CHECK (
    status IN ('pending','in_review')
    OR (resolved_by IS NOT NULL AND resolution_note IS NOT NULL AND length(btrim(resolution_note)) > 0)
  )
);
-- "이상 웨이퍼만" 필터의 핵심 경로.
CREATE INDEX idx_action_items_queue ON public.action_items(ontology_id, status, verdict);
CREATE INDEX idx_action_items_problem ON public.action_items(problem_id);
CREATE INDEX idx_action_items_subject ON public.action_items(subject_instance_id);

-- ── RLS(멤버십 스코프) ──
ALTER TABLE public.dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY dashboards_member ON public.dashboards FOR ALL TO authenticated USING (public.user_has_ontology_access(ontology_id)) WITH CHECK (public.user_has_ontology_access(ontology_id));
CREATE POLICY widgets_member ON public.dashboard_widgets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dashboards d WHERE d.id = dashboard_id AND public.user_has_ontology_access(d.ontology_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dashboards d WHERE d.id = dashboard_id AND public.user_has_ontology_access(d.ontology_id)));
CREATE POLICY action_items_member ON public.action_items FOR ALL TO authenticated USING (public.user_has_ontology_access(ontology_id)) WITH CHECK (public.user_has_ontology_access(ontology_id));
