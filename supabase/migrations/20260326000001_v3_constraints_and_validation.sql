-- ============================================================
-- v3 Migration: Constraints System + Validation Results
-- Date: 2026-03-26
--
-- Design Rationale:
-- 1. constraints 테이블: PRD 2.1의 제약 조건 관리 시스템 구현
--    - constraint_type으로 다양한 제약 유형을 단일 테이블에서 관리
--      (cardinality, disjoint, domain_range, property_value)
--    - 범용 jsonb 컬럼(config)으로 유형별 구체 설정을 유연하게 저장
--    - source/target class FK로 제약 대상을 명확히 지정
-- 2. edges 테이블 확장: 관계별 카디널리티를 직접 표현
--    - min_cardinality/max_cardinality nullable → 미설정 시 제약 없음
-- 3. validation_results 테이블: 유효성 검사 결과 캐시
--    - 커밋/푸시 전 검증 결과를 캐시하여 UI에서 빠르게 표시
--    - resolved_at로 해결 여부 추적
-- ============================================================

-- ─── 1. constraints 테이블 ───────────────────────────────────
-- 제약 조건 유형:
--   cardinality     - 관계별 min/max (relation_type_id + config.min, config.max)
--   disjoint        - 클래스 간 배타 관계 (source_class_id, target_class_id)
--   domain_range    - 관계의 허용 소스/타겟 강제 (relation_type_id + source/target class)
--   property_value  - 프로퍼티 값 범위/패턴 (property_id + config.min, config.max, config.pattern, config.enum)

CREATE TABLE constraints (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 제약 유형 구분
  constraint_type   text NOT NULL
    CHECK (constraint_type IN ('cardinality', 'disjoint', 'domain_range', 'property_value')),

  -- 사람이 읽을 수 있는 설명 (LLM이 자연어에서 변환 시 원문 보존)
  description       text NOT NULL DEFAULT '',

  -- 대상 참조 (nullable — 유형에 따라 다른 FK 사용)
  source_class_id   uuid REFERENCES classes(id) ON DELETE CASCADE,
  target_class_id   uuid REFERENCES classes(id) ON DELETE CASCADE,
  relation_type_id  uuid REFERENCES relation_types(id) ON DELETE CASCADE,
  property_id       uuid REFERENCES properties(id) ON DELETE CASCADE,

  -- 유형별 구체 설정 (유연한 jsonb)
  -- cardinality:    {"min": 1, "max": 1}
  -- disjoint:       {"group_name": "Equipment Types"} (선택)
  -- domain_range:   {"enforce_strict": true}
  -- property_value: {"min": 0, "max": 100, "pattern": "^[A-Z]+$", "allowed_values": [...]}
  config            jsonb NOT NULL DEFAULT '{}',

  -- 위반 시 심각도 (검증 엔진에서 사용)
  severity          text NOT NULL DEFAULT 'error'
    CHECK (severity IN ('info', 'warning', 'error')),

  -- 활성/비활성 토글 (사용자가 일시 비활성화 가능)
  is_active         boolean NOT NULL DEFAULT true,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 인덱스: 유형별 조회, 클래스/관계/프로퍼티별 조회
CREATE INDEX idx_constraints_type ON constraints(constraint_type);
CREATE INDEX idx_constraints_source_class ON constraints(source_class_id) WHERE source_class_id IS NOT NULL;
CREATE INDEX idx_constraints_target_class ON constraints(target_class_id) WHERE target_class_id IS NOT NULL;
CREATE INDEX idx_constraints_relation_type ON constraints(relation_type_id) WHERE relation_type_id IS NOT NULL;
CREATE INDEX idx_constraints_property ON constraints(property_id) WHERE property_id IS NOT NULL;
-- 활성 제약만 빠르게 조회 (검증 시 가장 빈번한 쿼리)
CREATE INDEX idx_constraints_active ON constraints(is_active) WHERE is_active = true;

-- ─── 2. edges 테이블에 카디널리티 컬럼 추가 ─────────────────
-- NULL = 제약 없음, 0 이상 정수만 허용
-- 기존 데이터는 NULL로 유지되어 안전

ALTER TABLE edges
  ADD COLUMN min_cardinality integer DEFAULT NULL
    CHECK (min_cardinality IS NULL OR min_cardinality >= 0),
  ADD COLUMN max_cardinality integer DEFAULT NULL
    CHECK (max_cardinality IS NULL OR max_cardinality >= 0);

-- max >= min 논리적 일관성 (둘 다 설정된 경우에만)
ALTER TABLE edges
  ADD CONSTRAINT chk_cardinality_range
    CHECK (
      min_cardinality IS NULL
      OR max_cardinality IS NULL
      OR max_cardinality >= min_cardinality
    );

-- ─── 3. validation_results 테이블 ────────────────────────────
-- 유효성 검사 결과 캐시
-- 검증 실행 시마다 해당 run의 결과를 저장하고, UI에서 severity별 필터링

CREATE TABLE validation_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 동일 검증 실행 단위를 묶는 ID (한 번의 "검증" 클릭 = 하나의 run)
  run_id          uuid NOT NULL,

  -- 심각도
  severity        text NOT NULL
    CHECK (severity IN ('info', 'warning', 'error')),

  -- 검증 규칙 코드 (예: 'CYCLIC_ISA', 'ORPHAN_NODE', 'CARDINALITY_VIOLATION')
  rule_code       text NOT NULL,

  -- 사람이 읽을 수 있는 메시지
  message         text NOT NULL,

  -- 위반 대상
  target_table    text NOT NULL
    CHECK (target_table IN ('classes', 'instances', 'properties', 'edges', 'relation_types', 'constraints')),
  target_id       uuid NOT NULL,

  -- 연관 제약 (있는 경우)
  constraint_id   uuid REFERENCES constraints(id) ON DELETE SET NULL,

  -- 해결 추적
  resolved_at     timestamptz DEFAULT NULL,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 인덱스: run별 조회, severity별 필터, 미해결 항목 조회
CREATE INDEX idx_vr_run ON validation_results(run_id);
CREATE INDEX idx_vr_severity ON validation_results(severity);
CREATE INDEX idx_vr_target ON validation_results(target_table, target_id);
-- 미해결 결과만 빠르게 조회 (가장 빈번한 UI 쿼리)
CREATE INDEX idx_vr_unresolved ON validation_results(run_id) WHERE resolved_at IS NULL;

-- ─── 4. updated_at 자동 갱신 트리거 (constraints) ────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_constraints_updated_at
  BEFORE UPDATE ON constraints
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ─── 5. RLS 비활성 (MVP) ─────────────────────────────────────
ALTER TABLE constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_results ENABLE ROW LEVEL SECURITY;

-- 모든 접근 허용 정책 (MVP — 단일 사용자)
CREATE POLICY "Allow all on constraints" ON constraints FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on validation_results" ON validation_results FOR ALL USING (true) WITH CHECK (true);
