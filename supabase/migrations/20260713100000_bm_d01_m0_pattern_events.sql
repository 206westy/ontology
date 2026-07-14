-- PRD-BM-D01 (M0): 패턴 마켓플레이스 계측 기반.
-- (1) pattern_events: 세션/시딩/커밋 이벤트 로깅 → TTFG(첫 그래프까지 시간)·활성화 델타 측정.
-- (2) patterns.occurrence_count: 사용빈도 신뢰 신호(카드 노출·큐레이션).
-- 기존 인프라에 시계열 이벤트 로거가 없어 신규 테이블이 필요하다(attributions 는 provenance 전용).

-- (1) pattern_events ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pattern_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     text NOT NULL,
  user_id        uuid,                              -- Supabase auth.uid (nullable)
  event_type     text NOT NULL,
  pattern_id     uuid REFERENCES patterns(id) ON DELETE SET NULL,
  pattern_source text,                              -- cache|discovered|shared (seed 이벤트만)
  partition_id   uuid,                              -- 시딩된 구획
  props          jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pattern_event_type
    CHECK (event_type IN ('session_started','free_input_started','pattern_seeded','first_commit')),
  CONSTRAINT chk_pattern_event_source
    CHECK (pattern_source IS NULL OR pattern_source IN ('cache','discovered','shared'))
);

CREATE INDEX IF NOT EXISTS idx_pattern_events_session ON pattern_events(session_id);
CREATE INDEX IF NOT EXISTS idx_pattern_events_type_time ON pattern_events(event_type, created_at);

-- RLS: deny-all(정책 없음). 앱은 Drizzle(DATABASE_URL)·service-role 로 우회한다.
-- (참고: 20260626000001_v6_enable_rls_lockdown.sql — anon/publishable 노출만 차단.)
ALTER TABLE pattern_events ENABLE ROW LEVEL SECURITY;

-- (2) patterns.occurrence_count ──────────────────────────────────────────
-- 사용(시딩/재사용) 빈도. 기존 행은 1 로 백필(가산적·비파괴).
ALTER TABLE patterns ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1;

COMMENT ON TABLE pattern_events IS '패턴 마켓플레이스 계측 이벤트(세션/시딩/커밋) — PRD-BM-D01 M0';
COMMENT ON COLUMN pattern_events.session_id IS '클라이언트 세션 식별자(TTFG 코호트 기준)';
COMMENT ON COLUMN pattern_events.event_type IS 'session_started|free_input_started|pattern_seeded|first_commit';
COMMENT ON COLUMN pattern_events.pattern_source IS 'cache|discovered|shared — 시딩 출처(seed 이벤트만)';
COMMENT ON COLUMN patterns.occurrence_count IS '사용(시딩/재사용) 빈도 — 신뢰 신호·큐레이션 (PRD-BM-D01)';
