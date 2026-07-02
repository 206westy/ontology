-- PRD-H (H1 / M1): 패턴 학습형 캐시(self-populating pattern cache).
-- 도메인 설계 패턴(ODP)을 재사용·버전 가능한 "번들"로 보관한다.
-- 번들 = 역할(node types) + 관계 타입 + competency question + 소비(traversal) 템플릿.
-- 비어서 시작 가능: 발견 파이프라인(retrieve › adapt › synthesize)이 캐시를 채운다.
-- 같은 도메인이 다시 들어오면 캐시된 패턴을 재사용(수렴)한다.
-- 출처(source_*)·라이선스(license)를 함께 저장해 발행 전 라이선스 미확인을 경고한다.

-- 1) patterns 테이블
CREATE TABLE IF NOT EXISTS patterns (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key                  text NOT NULL,
  name                 text NOT NULL,
  name_ko              text NOT NULL DEFAULT '',
  version              integer NOT NULL DEFAULT 1,
  domain               text NOT NULL,
  roles                jsonb NOT NULL DEFAULT '[]',
  relation_types       jsonb NOT NULL DEFAULT '[]',
  competency_questions jsonb NOT NULL DEFAULT '[]',
  traversal_templates  jsonb NOT NULL DEFAULT '[]',
  method               text NOT NULL DEFAULT 'synthesized',
  source_repo          text,
  source_uri           text,
  source_label         text,
  license              text,
  is_draft             boolean NOT NULL DEFAULT false,
  previous_version_id  uuid REFERENCES patterns(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pattern_key_version UNIQUE (key, version),
  CONSTRAINT chk_pattern_method
    CHECK (method IN ('retrieved', 'adapted', 'synthesized', 'bootstrap'))
);

-- 2) 도메인 히트(수렴) 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_patterns_domain ON patterns(domain);
CREATE INDEX IF NOT EXISTS idx_patterns_key ON patterns(key);

-- 3) RLS: deny-all(정책 없음). 앱은 Drizzle(DATABASE_URL)·service-role 로 우회하므로
--    anon/publishable 키 노출을 막을 뿐 앱 동작에는 영향이 없다.
--    (참고: 20260626000001_v6_enable_rls_lockdown.sql — FORCE 금지.)
ALTER TABLE patterns ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE patterns IS '패턴 학습형 캐시(역할+관계+CQ+traversal 번들) — PRD-H H1/M1';
COMMENT ON COLUMN patterns.key IS '패턴 식별 키(버전과 함께 UNIQUE)';
COMMENT ON COLUMN patterns.domain IS '도메인 라벨(수렴 조회 기준)';
COMMENT ON COLUMN patterns.method IS 'retrieved|adapted|synthesized|bootstrap — 발견 방식';
COMMENT ON COLUMN patterns.license IS '출처 라이선스(null/unknown = 발행 전 경고)';
COMMENT ON COLUMN patterns.is_draft IS '초안 여부(발견 직후 초안, 승격 시 false)';
COMMENT ON COLUMN patterns.previous_version_id IS '이전 버전(버전업 추적, ON DELETE SET NULL)';
