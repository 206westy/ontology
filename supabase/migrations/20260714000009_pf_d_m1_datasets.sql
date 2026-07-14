-- PRD-PF-D M1: 데이터셋 레지스트리(정제 데이터를 등록물로 승격해 여러 problem 이 재사용).
-- 워크스페이스 스코프. PF-A 완료 → workspace_id NOT NULL(기본 WS default). 얇은 커넥터·읽기전용.

-- ── datasources (연결 소스) ──
CREATE TABLE public.datasources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111'
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type text NOT NULL,
  name text NOT NULL,
  connection_config jsonb NOT NULL DEFAULT '{}'::jsonb,   -- 자격증명은 앱레벨 암호화(평문 금지)
  read_only boolean NOT NULL DEFAULT true,
  last_validated_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_datasource_type CHECK (type IN ('csv','db_view','table','parquet'))
);
CREATE INDEX idx_datasources_workspace ON public.datasources(workspace_id);

-- ── datasets (등록된 데이터셋 = 재사용 단위) ──
CREATE TABLE public.datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111'
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  datasource_id uuid REFERENCES public.datasources(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ready',
  row_count integer,
  storage_ref text,                                        -- 스냅샷 위치(메타만; 전체행 미물리화)
  checksum text,                                           -- 스키마+표본 해시(드리프트 감지)
  refreshed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_dataset_status CHECK (status IN ('ready','profiling','stale','error')),
  CONSTRAINT uq_dataset_name_per_ws UNIQUE (workspace_id, name)
);
CREATE INDEX idx_datasets_workspace ON public.datasets(workspace_id);

-- ── dataset_columns (컬럼 프로파일) ──
CREATE TABLE public.dataset_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  name text NOT NULL,
  ordinal_position integer NOT NULL,
  data_type text NOT NULL DEFAULT 'unknown',
  nullable boolean NOT NULL DEFAULT true,
  missing_rate real,
  distinct_count integer,
  sample_values jsonb NOT NULL DEFAULT '[]'::jsonb,
  min_value text,
  max_value text,
  enum_values jsonb,
  profiled_at timestamptz,
  CONSTRAINT chk_dscol_data_type CHECK (data_type IN ('string','integer','float','boolean','date','datetime','enum','unknown')),
  CONSTRAINT uq_dscol_name_per_dataset UNIQUE (dataset_id, name)
);
CREATE INDEX idx_dscol_dataset ON public.dataset_columns(dataset_id);

-- ── dataset_column_mappings (컬럼 → 클래스/속성, 온톨로지 스코프) ──
CREATE TABLE public.dataset_column_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_column_id uuid NOT NULL REFERENCES public.dataset_columns(id) ON DELETE CASCADE,
  ontology_id uuid NOT NULL REFERENCES public.ontologies(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  target_property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  confidence real,
  source text NOT NULL DEFAULT 'user',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_dscm_target_type CHECK (target_type IN ('class','property')),
  CONSTRAINT chk_dscm_source CHECK (source IN ('user','embedding_suggested')),
  CONSTRAINT chk_dscm_xor CHECK (
    (target_type='class' AND target_class_id IS NOT NULL AND target_property_id IS NULL)
    OR (target_type='property' AND target_property_id IS NOT NULL AND target_class_id IS NULL)
  )
);
CREATE INDEX idx_dscm_column ON public.dataset_column_mappings(dataset_column_id);
CREATE INDEX idx_dscm_ontology ON public.dataset_column_mappings(ontology_id);

-- ── problem_datasets (재사용의 실체: 문제↔데이터셋) ──
CREATE TABLE public.problem_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id uuid NOT NULL REFERENCES public.problems(id) ON DELETE CASCADE,
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'primary',
  attached_by uuid,
  attached_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pd_role CHECK (role IN ('primary','reference')),
  CONSTRAINT uq_problem_dataset UNIQUE (problem_id, dataset_id)
);
CREATE INDEX idx_pd_problem ON public.problem_datasets(problem_id);
CREATE INDEX idx_pd_dataset ON public.problem_datasets(dataset_id);

-- ── RLS(멤버십 스코프) ──
ALTER TABLE public.datasources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_column_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problem_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY datasources_member_all ON public.datasources
  FOR ALL TO authenticated
  USING (public.user_has_workspace_access(workspace_id))
  WITH CHECK (public.user_has_workspace_access(workspace_id));

CREATE POLICY datasets_member_all ON public.datasets
  FOR ALL TO authenticated
  USING (public.user_has_workspace_access(workspace_id))
  WITH CHECK (public.user_has_workspace_access(workspace_id));

CREATE POLICY dataset_columns_member_all ON public.dataset_columns
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.datasets d WHERE d.id = dataset_id AND public.user_has_workspace_access(d.workspace_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.datasets d WHERE d.id = dataset_id AND public.user_has_workspace_access(d.workspace_id)));

CREATE POLICY dscm_member_all ON public.dataset_column_mappings
  FOR ALL TO authenticated
  USING (public.user_has_ontology_access(ontology_id))
  WITH CHECK (public.user_has_ontology_access(ontology_id));

CREATE POLICY problem_datasets_member_all ON public.problem_datasets
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.problems p WHERE p.id = problem_id AND public.user_has_workspace_access(p.workspace_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.problems p WHERE p.id = problem_id AND public.user_has_workspace_access(p.workspace_id)));
