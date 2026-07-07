-- PRD-L M1: 공리+제약 → Dynamic 단일 "규칙" 통합.
-- constraints 를 정본 규칙 테이블로 격상: kind('enforced'|'memo') 추가.
-- - enforced: 타입 규칙(cardinality/disjoint/domain_range/property_value) — 검증 엔진 대상.
-- - memo: 자유서술 설명 메모(비강제) — constraint_type 없이 description 만.
-- 그린필드(테스트 데이터 폐기 승인, 2026-07-07): axioms/axiom_classes 는 DROP.

-- 1) kind 컬럼 추가
ALTER TABLE constraints
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'enforced';

ALTER TABLE constraints
  ADD CONSTRAINT chk_constraint_kind CHECK (kind IN ('enforced', 'memo'));

-- 2) constraint_type 을 memo 에서 생략 가능하게 완화
ALTER TABLE constraints
  ALTER COLUMN constraint_type DROP NOT NULL;

-- 기존 타입 CHECK 를 kind 결합형으로 교체
ALTER TABLE constraints
  DROP CONSTRAINT IF EXISTS chk_constraint_type;

ALTER TABLE constraints
  ADD CONSTRAINT chk_constraint_type CHECK (
    (kind = 'enforced'
      AND constraint_type IN ('cardinality', 'disjoint', 'domain_range', 'property_value'))
    OR
    (kind = 'memo' AND constraint_type IS NULL)
  );

-- 3) 기존 axiom 데이터 흡수(무손실 — 남아 있으면 memo 로 이관; 그린필드라 보통 0건)
INSERT INTO constraints (kind, constraint_type, description, source_class_id, severity, is_active)
SELECT
  'memo',
  NULL,
  a.description,
  (SELECT ac.class_id FROM axiom_classes ac WHERE ac.axiom_id = a.id LIMIT 1),
  a.severity,
  true
FROM axioms a;

-- 4) axiom 계열 테이블 제거
DROP TABLE IF EXISTS axiom_classes;
DROP TABLE IF EXISTS axioms;
