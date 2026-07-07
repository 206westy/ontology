-- PRD-J (M1): 온톨로지 GitFlow — 브랜치·작성자 기반.
-- 브랜치 = "분기 시점 그래프 스냅샷(base_snapshot) + 이후 커밋 체인" (엔티티 테이블 무변경).
-- 규약: 엔티티 테이블(classes/instances/...)은 항상 main 작업본이며,
--       commits.branch_id IS NULL = main 커밋. 브랜치 커밋은 main 에 적용되지 않고
--       병합(M3)에서만 main 엔티티로 반영된다. Neo4j push 는 main 커밋 전용(M4 가드).
-- 기존 데이터 호환: commits 신규 컬럼은 전부 nullable → 기존 행/흐름 무변경.

-- 1) branches 테이블
CREATE TABLE IF NOT EXISTS branches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  author_id       uuid,                                   -- auth.users.id (표시용, FK 없음: auth 스키마 분리)
  author_email    text,                                   -- 표시용 스냅샷(유저 삭제에도 이력 보존)
  base_commit_id  uuid REFERENCES commits(id) ON DELETE SET NULL,  -- 분기 시점 main 최신 커밋(없을 수 있음)
  base_snapshot   jsonb NOT NULL,                         -- 분기 시점 그래프 전체(export 포맷 + schemaVersion)
  status          text NOT NULL DEFAULT 'active',
  merged_at       timestamptz,
  merged_by       uuid,
  merge_commit_id uuid REFERENCES commits(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_branch_name UNIQUE (name),
  CONSTRAINT chk_branch_status CHECK (status IN ('active', 'merged', 'abandoned')),
  CONSTRAINT chk_branch_name_not_main CHECK (lower(name) <> 'main')  -- 'main'은 예약(행 없음 규약)
);

CREATE INDEX IF NOT EXISTS idx_branches_status ON branches (status);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE branches IS '온톨로지 브랜치(베이스 스냅샷+커밋 체인) — PRD-J M1';
COMMENT ON COLUMN branches.base_snapshot IS '분기 시점 그래프 전체 스냅샷(체크아웃=이것+브랜치 커밋 재생)';
COMMENT ON COLUMN branches.base_commit_id IS '분기 시점 main 최신 커밋(3-way 충돌 기준점)';

-- 2) commits 확장 — 작성자·브랜치·부모
ALTER TABLE commits ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE commits ADD COLUMN IF NOT EXISTS author_id uuid;
ALTER TABLE commits ADD COLUMN IF NOT EXISTS author_email text;
ALTER TABLE commits ADD COLUMN IF NOT EXISTS parent_commit_id uuid REFERENCES commits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commits_branch ON commits (branch_id);

COMMENT ON COLUMN commits.branch_id IS 'NULL=main 커밋, 값 있으면 해당 브랜치 커밋(main 미적용) — PRD-J';
COMMENT ON COLUMN commits.author_id IS '작성자 auth.users.id (미로그인/과거 커밋은 NULL)';
COMMENT ON COLUMN commits.author_email IS '작성자 이메일 스냅샷(표시용)';
COMMENT ON COLUMN commits.parent_commit_id IS '같은 체인 내 직전 커밋(이력 그래프용)';

-- (M2 추가, 같은 PRD-J) 커밋 내 변경 순서 보존 — 브랜치 재생·병합의 결정적 적용 순서.
ALTER TABLE commit_details ADD COLUMN IF NOT EXISTS seq integer;
COMMENT ON COLUMN commit_details.seq IS '커밋 내 변경 순번(재생 순서 보장) — PRD-J M2';
