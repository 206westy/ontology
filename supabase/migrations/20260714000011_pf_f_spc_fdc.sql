-- PRD-PF-F: SPC/FDC 통계 엔진 데이터모델. 통계는 엔진(lib/spc·lib/fdc, JS 인프로세스),
-- 온톨로지/그래프는 조직·재사용·설명·근거화만. 원본 시계열 그래프 복제 금지(판정 요약만 발행).
-- 스코프: ontology_id + 멤버십 RLS 상속. 모듈 토글은 워크스페이스 레벨(기본 off = 선택적 도메인 모듈).

-- ── 모듈 토글 (워크스페이스 레벨, 기본 off) ──
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS spc_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS fdc_enabled boolean NOT NULL DEFAULT false;

-- ── kinetic Function impl_type 확장: 통계엔진 호출형(spc/fdc) 추가 ──
ALTER TABLE public.functions DROP CONSTRAINT IF EXISTS chk_function_impl_type;
ALTER TABLE public.functions ADD CONSTRAINT chk_function_impl_type CHECK (impl_type IN ('ast','code','spc','fdc'));

-- ── spec_limits (공정변수=측정 속성별 스펙) ──
CREATE TABLE public.spec_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ontology_id uuid NOT NULL REFERENCES public.ontologies(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  usl double precision,
  lsl double precision,
  target double precision,
  unit text,
  revision integer NOT NULL DEFAULT 1,
  effective_from timestamptz NOT NULL DEFAULT now(),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_spec_limits_bounds CHECK (usl IS NULL OR lsl IS NULL OR usl >= lsl),
  CONSTRAINT uq_spec_limits_rev UNIQUE (property_id, revision)
);
CREATE INDEX idx_spec_limits_ontology ON public.spec_limits(ontology_id);
CREATE INDEX idx_spec_limits_property ON public.spec_limits(property_id);

-- ── spc_rulesets (적용 룰셋: WE/Nelson 중 on/off) ──
CREATE TABLE public.spc_rulesets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ontology_id uuid NOT NULL REFERENCES public.ontologies(id) ON DELETE CASCADE,
  name text NOT NULL,
  rules_enabled jsonb NOT NULL DEFAULT '[]'::jsonb,
  owner_function_id uuid REFERENCES public.functions(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_spc_rulesets_ontology ON public.spc_rulesets(ontology_id);

-- ── control_limits (통계엔진 산출 관리한계 저장; 자동 재계산 금지=엔지니어 트리거) ──
CREATE TABLE public.control_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ontology_id uuid NOT NULL REFERENCES public.ontologies(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  chart_type text NOT NULL,
  ucl double precision,
  lcl double precision,
  centerline double precision,
  ucl_secondary double precision,
  lcl_secondary double precision,
  centerline_secondary double precision,
  subgroup_size integer NOT NULL DEFAULT 1,
  sample_count integer,
  sigma double precision,
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_by text NOT NULL DEFAULT 'js-spc@1',
  CONSTRAINT chk_control_limits_chart CHECK (chart_type IN ('xbar_r','i_mr','p','np','c','u'))
);
CREATE INDEX idx_control_limits_ontology ON public.control_limits(ontology_id);
CREATE INDEX idx_control_limits_property ON public.control_limits(property_id, chart_type, computed_at DESC);

-- ── spc_runs (개별 판정 실행 결과; 관리도 시계열·근거) ──
CREATE TABLE public.spc_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ontology_id uuid NOT NULL REFERENCES public.ontologies(id) ON DELETE CASCADE,
  function_id uuid REFERENCES public.functions(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  instance_id uuid REFERENCES public.instances(id) ON DELETE SET NULL,
  lot_id text,
  batch_id text,
  chart_type text NOT NULL,
  verdict text NOT NULL,
  violated_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  control_limit_id uuid REFERENCES public.control_limits(id) ON DELETE SET NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_spc_runs_verdict CHECK (verdict IN ('pass','warn','fail')),
  CONSTRAINT chk_spc_runs_chart CHECK (chart_type IN ('xbar_r','i_mr','p','np','c','u'))
);
CREATE INDEX idx_spc_runs_ontology ON public.spc_runs(ontology_id);
CREATE INDEX idx_spc_runs_property ON public.spc_runs(property_id, evaluated_at DESC);
CREATE INDEX idx_spc_runs_verdict ON public.spc_runs(ontology_id, verdict);

-- ── fdc_traces (설비 센서 트레이스 판정; SPC와 개념 분리) ──
CREATE TABLE public.fdc_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ontology_id uuid NOT NULL REFERENCES public.ontologies(id) ON DELETE CASCADE,
  function_id uuid REFERENCES public.functions(id) ON DELETE SET NULL,
  equipment_instance_id uuid REFERENCES public.instances(id) ON DELETE SET NULL,
  sensor_property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  detection_method text NOT NULL,
  fault_flag boolean NOT NULL DEFAULT false,
  score double precision,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_fdc_method CHECK (detection_method IN ('threshold','trend'))
);
CREATE INDEX idx_fdc_traces_ontology ON public.fdc_traces(ontology_id);
CREATE INDEX idx_fdc_traces_equipment ON public.fdc_traces(equipment_instance_id);

-- ── RLS(2차 방어, 멤버십 스코프 상속) ──
ALTER TABLE public.spec_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spc_rulesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spc_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fdc_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY spec_limits_member ON public.spec_limits FOR ALL TO authenticated USING (public.user_has_ontology_access(ontology_id)) WITH CHECK (public.user_has_ontology_access(ontology_id));
CREATE POLICY spc_rulesets_member ON public.spc_rulesets FOR ALL TO authenticated USING (public.user_has_ontology_access(ontology_id)) WITH CHECK (public.user_has_ontology_access(ontology_id));
CREATE POLICY control_limits_member ON public.control_limits FOR ALL TO authenticated USING (public.user_has_ontology_access(ontology_id)) WITH CHECK (public.user_has_ontology_access(ontology_id));
CREATE POLICY spc_runs_member ON public.spc_runs FOR ALL TO authenticated USING (public.user_has_ontology_access(ontology_id)) WITH CHECK (public.user_has_ontology_access(ontology_id));
CREATE POLICY fdc_traces_member ON public.fdc_traces FOR ALL TO authenticated USING (public.user_has_ontology_access(ontology_id)) WITH CHECK (public.user_has_ontology_access(ontology_id));
