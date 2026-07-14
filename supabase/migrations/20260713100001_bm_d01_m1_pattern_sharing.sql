-- PRD-BM-D01 (M1): 패턴 공유 스코프 + 헬스 점수(큐레이션 신뢰 신호).
-- visibility: private(기본)|org|public — 첫 공유 단위는 org(B2B 안전). public 은 후순위 노출.
-- health: 0~100, 발행 시 산정(M2). 카탈로그 큐레이션(임계 이하 dim/하단)의 신뢰 신호.

ALTER TABLE patterns ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';
ALTER TABLE patterns ADD COLUMN IF NOT EXISTS health real;

DO $$ BEGIN
  ALTER TABLE patterns ADD CONSTRAINT chk_pattern_visibility
    CHECK (visibility IN ('private', 'org', 'public'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_patterns_visibility ON patterns(visibility);

COMMENT ON COLUMN patterns.visibility IS 'private|org|public — 공유 스코프 (PRD-BM-D01 M1)';
COMMENT ON COLUMN patterns.health IS '0~100 헬스 점수 — 발행 시 산정, 큐레이션 신뢰 신호 (PRD-BM-D01)';
