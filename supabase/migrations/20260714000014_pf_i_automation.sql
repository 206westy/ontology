-- PRD-PF-I: 자동화·트리거·상태 라이프사이클("다이나믹 레이어"의 실체=(b)상태+(c)이벤트트리거).
-- ★완전자동 금지★: automation_runs 는 제안(action_items pending)까지만. 확정은 사람(PRD-G).
-- 준실시간(폴링/스케줄). 스코프: ontology_id + 멤버십 RLS.

CREATE TABLE public.object_state_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ontology_id uuid NOT NULL REFERENCES public.ontologies(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  states jsonb NOT NULL DEFAULT '[]'::jsonb,
  initial_state text NOT NULL,
  transitions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_state_def_class UNIQUE (class_id)
);
CREATE INDEX idx_state_defs_ontology ON public.object_state_defs(ontology_id);

CREATE TABLE public.instance_state_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ontology_id uuid NOT NULL REFERENCES public.ontologies(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  from_state text,
  to_state text NOT NULL,
  actor text NOT NULL DEFAULT 'user',
  triggered_by_run_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_state_log_instance ON public.instance_state_log(instance_id, created_at DESC);

CREATE TABLE public.triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111' REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ontology_id uuid NOT NULL REFERENCES public.ontologies(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_type text NOT NULL,
  event_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_function_id uuid REFERENCES public.functions(id) ON DELETE SET NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  rate_limit jsonb NOT NULL DEFAULT '{"max_runs_per_hour":12,"cooldown_seconds":60}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_trigger_event CHECK (event_type IN ('dataset_updated','schedule','instance_created','instance_updated','manual'))
);
CREATE INDEX idx_triggers_ontology ON public.triggers(ontology_id);

CREATE TABLE public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ontology_id uuid NOT NULL REFERENCES public.ontologies(id) ON DELETE CASCADE,
  trigger_id uuid REFERENCES public.triggers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_proposal_id uuid REFERENCES public.action_items(id) ON DELETE SET NULL,
  state_transition_id uuid REFERENCES public.instance_state_log(id) ON DELETE SET NULL,
  error text,
  actor text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_run_status CHECK (status IN ('queued','running','succeeded','failed','skipped_rate_limit','skipped_disabled')),
  CONSTRAINT chk_run_actor CHECK (actor IN ('system','user'))
);
CREATE INDEX idx_runs_trigger ON public.automation_runs(trigger_id, created_at DESC);
CREATE INDEX idx_runs_ontology ON public.automation_runs(ontology_id, created_at DESC);

ALTER TABLE public.instance_state_log
  ADD CONSTRAINT fk_state_log_run FOREIGN KEY (triggered_by_run_id)
  REFERENCES public.automation_runs(id) ON DELETE SET NULL;

ALTER TABLE public.object_state_defs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instance_state_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY state_defs_member ON public.object_state_defs FOR ALL TO authenticated USING (public.user_has_ontology_access(ontology_id)) WITH CHECK (public.user_has_ontology_access(ontology_id));
CREATE POLICY state_log_member ON public.instance_state_log FOR ALL TO authenticated USING (public.user_has_ontology_access(ontology_id)) WITH CHECK (public.user_has_ontology_access(ontology_id));
CREATE POLICY triggers_member ON public.triggers FOR ALL TO authenticated USING (public.user_has_ontology_access(ontology_id)) WITH CHECK (public.user_has_ontology_access(ontology_id));
CREATE POLICY runs_member ON public.automation_runs FOR ALL TO authenticated USING (public.user_has_ontology_access(ontology_id)) WITH CHECK (public.user_has_ontology_access(ontology_id));
