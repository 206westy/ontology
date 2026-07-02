-- PRD-H (H4 / M3): 맥락 주입형 용어 해소용 용어집 캐시(term glossary cache).
-- 미정의·모호 용어(약어·은어, 예 `VV`)를 도메인 + 현재 온톨로지 맥락으로 좁혀
-- 확정한 뜻을 도메인-스코프로 보관한다. 전역 사실이 아니라 "이 도메인/구획의 뜻"이다.
-- 확정 결과를 여기 캐시해 (1) 재검색 폭주를 막고 (2) 이후 추출·검색 맥락에 재주입한다.
-- 같은 약어라도 도메인이 다르면 별도 행 → 전역 강제 없음(구획-스코프).

-- 1) term_glossary 테이블
CREATE TABLE IF NOT EXISTS term_glossary (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain        text NOT NULL,
  partition_id  uuid REFERENCES partitions(id) ON DELETE SET NULL,
  term          text NOT NULL,
  meaning       text NOT NULL,
  source        text NOT NULL DEFAULT 'user',
  confidence    real,
  evidence      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_term_glossary_domain_term UNIQUE (domain, term),
  CONSTRAINT chk_term_glossary_source
    CHECK (source IN ('internal', 'context', 'web', 'user'))
);

-- 2) 도메인 스코프 조회용 인덱스(재주입·룩업 기준)
CREATE INDEX IF NOT EXISTS idx_term_glossary_domain ON term_glossary(domain);

-- 3) RLS: deny-all(정책 없음). 앱은 Drizzle(DATABASE_URL)·service-role 로 우회하므로
--    anon/publishable 키 노출을 막을 뿐 앱 동작에는 영향이 없다.
--    (참고: 20260626000001_v6_enable_rls_lockdown.sql — FORCE 금지.)
ALTER TABLE term_glossary ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE term_glossary IS '맥락 주입형 용어 해소 캐시(도메인-스코프 약어·은어 뜻) — PRD-H H4/M3';
COMMENT ON COLUMN term_glossary.domain IS '도메인 스코프 키(같은 약어라도 도메인별 별개 뜻)';
COMMENT ON COLUMN term_glossary.partition_id IS '구획 스코프(선택). 구획 삭제 시 NULL(도메인 스코프는 유지)';
COMMENT ON COLUMN term_glossary.term IS '용어/약어 원문(예: VV)';
COMMENT ON COLUMN term_glossary.meaning IS '이 도메인 맥락에서 확정된 뜻(예: 밸브)';
COMMENT ON COLUMN term_glossary.source IS 'internal|context|web|user — 뜻의 근거 출처';
COMMENT ON COLUMN term_glossary.confidence IS '해소 신뢰도(0~1, null 허용)';
COMMENT ON COLUMN term_glossary.evidence IS '근거 스니펫/맥락 요약(선택)';
