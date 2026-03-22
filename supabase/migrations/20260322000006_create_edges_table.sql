CREATE TABLE edges (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relation_type_id  uuid NOT NULL REFERENCES relation_types(id) ON DELETE CASCADE,
  source_id         uuid NOT NULL,
  target_id         uuid NOT NULL,
  source_kind       text NOT NULL CHECK (source_kind IN ('class', 'instance')),
  target_kind       text NOT NULL CHECK (target_kind IN ('class', 'instance')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_edge UNIQUE (relation_type_id, source_id, target_id),
  CONSTRAINT chk_no_self_loop CHECK (source_id != target_id)
);
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_edges_relation ON edges(relation_type_id);
