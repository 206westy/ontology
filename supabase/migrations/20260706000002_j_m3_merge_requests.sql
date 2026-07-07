-- PRD-J (M3): 머지 리퀘스트 — 브랜치 → main 병합의 리뷰 게이트.
-- open → approved → merged (또는 closed). 병합 실행은 /api/merge-requests/[id]/merge 가
-- 3-way 충돌 검사 후 main 엔티티 테이블 + 병합 커밋을 단일 트랜잭션으로 적용한다.
CREATE TABLE IF NOT EXISTS merge_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  author_id    uuid,
  author_email text,
  status       text NOT NULL DEFAULT 'open',
  reviewer_id  uuid,
  reviewer_email text,
  reviewed_at  timestamptz,
  merged_at    timestamptz,
  merge_commit_id uuid REFERENCES commits(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_mr_status CHECK (status IN ('open', 'approved', 'merged', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_mr_status ON merge_requests (status);
CREATE INDEX IF NOT EXISTS idx_mr_branch ON merge_requests (branch_id);

ALTER TABLE merge_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE merge_requests IS '머지 리퀘스트(브랜치→main 리뷰 게이트) — PRD-J M3';
