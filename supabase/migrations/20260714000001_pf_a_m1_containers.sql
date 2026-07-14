-- PRD-PF-A M1: 멀티 온톨로지 컨테이너 신설 (workspaces/ontologies/memberships) + 부트스트랩 시드
-- 파괴 없음: 기존 17개 도메인 테이블 무변경(회귀 0). 스코프 소급(ontology_id)은 M2에서.
-- 고정 UUID: 기본 워크스페이스 1111.../기본 온톨로지 2222... (partitions 기본 00..001 관례 계승).

CREATE TABLE IF NOT EXISTS workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ontologies (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                     text NOT NULL,
  slug                     text NOT NULL,
  description              text NOT NULL DEFAULT '',
  status                   text NOT NULL DEFAULT 'active',
  default_branch_id        uuid,                       -- M4에서 branches FK 배선(순환 회피 위해 지금은 컬럼만)
  forked_from_ontology_id  uuid REFERENCES ontologies(id) ON DELETE SET NULL,
  created_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ontology_slug_per_ws UNIQUE (workspace_id, slug),
  CONSTRAINT chk_ontology_status CHECK (status IN ('active','archived'))
);

CREATE TABLE IF NOT EXISTS memberships (
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  role          text NOT NULL DEFAULT 'editor',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_memberships PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT chk_membership_role CHECK (role IN ('owner','admin','editor','viewer'))
);

CREATE INDEX IF NOT EXISTS idx_ontologies_ws ON ontologies (workspace_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships (user_id);

-- 부트스트랩 시드(고정 UUID, 재실행 안전)
INSERT INTO workspaces (id, name, slug)
VALUES ('11111111-1111-1111-1111-111111111111', '기본 워크스페이스', 'default')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ontologies (id, workspace_id, name, slug, description)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  '기본 온톨로지', 'default',
  '기존 단일 전역 그래프가 귀속되는 기본 온톨로지'
)
ON CONFLICT (id) DO NOTHING;

-- 기존 사용자 전원을 기본 워크스페이스 owner 로 등록(PII 미노출: INSERT .. SELECT).
INSERT INTO memberships (workspace_id, user_id, role)
SELECT '11111111-1111-1111-1111-111111111111', id, 'owner'
FROM auth.users
ON CONFLICT (workspace_id, user_id) DO NOTHING;
