CREATE TABLE commits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message         text DEFAULT '',
  pushed_to_neo4j boolean NOT NULL DEFAULT false,
  pushed_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE commit_details (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commit_id       uuid NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  operation       text NOT NULL CHECK (operation IN ('ADD', 'MOD', 'DEL')),
  target_table    text NOT NULL,
  target_id       uuid NOT NULL,
  before_snapshot jsonb,
  after_snapshot  jsonb
);
CREATE INDEX idx_cd_commit ON commit_details(commit_id);
