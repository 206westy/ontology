-- PRD-PF-B M1: 결정함수(일급) 데이터모델. 안 B(별도 테이블) 채택 —
-- 무결성 제약(constraints)과 목적이 정반대(모델 유효성 vs 인스턴스 판정)이므로 스키마에서 분리.
-- 판정 결과(decision_results)는 validation_results 형제 구조로 재배치(감사·조회 공유).
-- 스코프: PRD-PF-A ontology_id + 멤버십 RLS 상속.

CREATE TABLE IF NOT EXISTS functions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ontology_id     uuid NOT NULL REFERENCES ontologies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  target_class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
  inputs          jsonb NOT NULL DEFAULT '[]',   -- [{propertyId, alias}]
  logic           jsonb NOT NULL DEFAULT '{}',   -- 선언적 AST(코드 아님, 화이트리스트 연산자)
  output_spec     jsonb NOT NULL DEFAULT '{}',   -- {kind: pass_fail|score|recommend, labels?, range?}
  nl_source       text,                          -- 자연어 원문(차별점)
  impl_type       text NOT NULL DEFAULT 'ast',   -- 'ast'(Tier1) | 'code'(Tier2, 후속)
  status          text NOT NULL DEFAULT 'draft', -- draft|confirmed|archived
  version         integer NOT NULL DEFAULT 1,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_function_impl_type CHECK (impl_type IN ('ast','code')),
  CONSTRAINT chk_function_status    CHECK (status IN ('draft','confirmed','archived'))
);
CREATE INDEX IF NOT EXISTS idx_functions_ontology ON functions (ontology_id);
CREATE INDEX IF NOT EXISTS idx_functions_target_class ON functions (target_class_id);

CREATE TABLE IF NOT EXISTS decision_results (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ontology_id      uuid NOT NULL REFERENCES ontologies(id) ON DELETE CASCADE,
  function_id      uuid NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  instance_id      uuid NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  verdict          jsonb NOT NULL,                 -- {kind, pass?|score?|label?|recommendation?}
  input_snapshot   jsonb NOT NULL DEFAULT '{}',    -- 감사: 판정에 쓰인 속성값(alias→value)
  input_hash       text NOT NULL,                  -- 결정론 검증(동일 입력→동일 해시)
  function_version integer NOT NULL DEFAULT 1,
  evaluated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_decision_results_function ON decision_results (function_id);
CREATE INDEX IF NOT EXISTS idx_decision_results_instance ON decision_results (instance_id);
CREATE INDEX IF NOT EXISTS idx_decision_results_ontology ON decision_results (ontology_id);

-- RLS(2차 방어, PRD-PF-A 멤버십 스코프 상속)
ALTER TABLE functions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY functions_member        ON functions        FOR ALL TO authenticated USING (user_has_ontology_access(ontology_id)) WITH CHECK (user_has_ontology_access(ontology_id));
CREATE POLICY decision_results_member ON decision_results FOR ALL TO authenticated USING (user_has_ontology_access(ontology_id)) WITH CHECK (user_has_ontology_access(ontology_id));
