-- PRD-PF-A M5: RLS 멤버십 스코프(2차 방어). deny-all(무정책) → 멤버십 스코프 정책.
-- 정직: 앱은 서비스롤(BYPASSRLS)로 접근하므로 1차 방어는 앱계층 requireOntologyAccess.
-- 이 RLS 는 (a) 향후 anon/authenticated 직접 쿼리 경로 방어, (b) 감사·규제 관점 DB 레벨 접근통제.
-- anon 역할은 정책이 없어 계속 전면 차단.

-- ── 접근 판정 함수(SECURITY DEFINER: ontologies/memberships 를 RLS 우회로 조회, 재귀 회피) ──
CREATE OR REPLACE FUNCTION user_has_workspace_access(p_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.workspace_id = p_workspace_id AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION user_has_ontology_access(p_ontology_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM ontologies o
    JOIN memberships m ON m.workspace_id = o.workspace_id
    WHERE o.id = p_ontology_id AND m.user_id = auth.uid()
  );
$$;

-- ── 컨테이너 3종: RLS 활성 + 정책 ──
ALTER TABLE workspaces  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ontologies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspaces_member ON workspaces FOR ALL TO authenticated
  USING (user_has_workspace_access(id)) WITH CHECK (user_has_workspace_access(id));
CREATE POLICY ontologies_member ON ontologies FOR ALL TO authenticated
  USING (user_has_workspace_access(workspace_id)) WITH CHECK (user_has_workspace_access(workspace_id));
CREATE POLICY memberships_member ON memberships FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_has_workspace_access(workspace_id))
  WITH CHECK (user_id = auth.uid() OR user_has_workspace_access(workspace_id));

-- ── 14 코어(ontology_id 스코프) ──
CREATE POLICY classes_member            ON classes            FOR ALL TO authenticated USING (user_has_ontology_access(ontology_id)) WITH CHECK (user_has_ontology_access(ontology_id));
CREATE POLICY properties_member         ON properties         FOR ALL TO authenticated USING (user_has_ontology_access(ontology_id)) WITH CHECK (user_has_ontology_access(ontology_id));
CREATE POLICY instances_member          ON instances          FOR ALL TO authenticated USING (user_has_ontology_access(ontology_id)) WITH CHECK (user_has_ontology_access(ontology_id));
CREATE POLICY instance_values_member    ON instance_values    FOR ALL TO authenticated USING (user_has_ontology_access(ontology_id)) WITH CHECK (user_has_ontology_access(ontology_id));
CREATE POLICY relation_types_member     ON relation_types     FOR ALL TO authenticated USING (user_has_ontology_access(ontology_id)) WITH CHECK (user_has_ontology_access(ontology_id));
CREATE POLICY edges_member              ON edges              FOR ALL TO authenticated USING (user_has_ontology_access(ontology_id)) WITH CHECK (user_has_ontology_access(ontology_id));
CREATE POLICY constraints_member        ON constraints        FOR ALL TO authenticated USING (user_has_ontology_access(ontology_id)) WITH CHECK (user_has_ontology_access(ontology_id));
CREATE POLICY validation_results_member ON validation_results FOR ALL TO authenticated USING (user_has_ontology_access(ontology_id)) WITH CHECK (user_has_ontology_access(ontology_id));
CREATE POLICY partitions_member         ON partitions         FOR ALL TO authenticated USING (user_has_ontology_access(ontology_id)) WITH CHECK (user_has_ontology_access(ontology_id));
CREATE POLICY attributions_member       ON attributions       FOR ALL TO authenticated USING (user_has_ontology_access(ontology_id)) WITH CHECK (user_has_ontology_access(ontology_id));
CREATE POLICY commits_member            ON commits            FOR ALL TO authenticated USING (user_has_ontology_access(ontology_id)) WITH CHECK (user_has_ontology_access(ontology_id));
CREATE POLICY commit_details_member     ON commit_details     FOR ALL TO authenticated USING (user_has_ontology_access(ontology_id)) WITH CHECK (user_has_ontology_access(ontology_id));
CREATE POLICY branches_member           ON branches           FOR ALL TO authenticated USING (user_has_ontology_access(ontology_id)) WITH CHECK (user_has_ontology_access(ontology_id));
CREATE POLICY merge_requests_member     ON merge_requests     FOR ALL TO authenticated USING (user_has_ontology_access(ontology_id)) WITH CHECK (user_has_ontology_access(ontology_id));

-- ── 3 특수(workspace_id 스코프, NULL=공용 라이브러리 → 전원 읽기 허용) ──
CREATE POLICY patterns_ws          ON patterns          FOR ALL TO authenticated USING (workspace_id IS NULL OR user_has_workspace_access(workspace_id)) WITH CHECK (workspace_id IS NULL OR user_has_workspace_access(workspace_id));
CREATE POLICY term_glossary_ws     ON term_glossary     FOR ALL TO authenticated USING (workspace_id IS NULL OR user_has_workspace_access(workspace_id)) WITH CHECK (workspace_id IS NULL OR user_has_workspace_access(workspace_id));
CREATE POLICY relation_glossary_ws ON relation_glossary FOR ALL TO authenticated USING (workspace_id IS NULL OR user_has_workspace_access(workspace_id)) WITH CHECK (workspace_id IS NULL OR user_has_workspace_access(workspace_id));
