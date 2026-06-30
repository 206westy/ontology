-- PRD-E / P2-2: 임베딩 dedup·RAG 인덱스.
-- embedding 컬럼(vector(1536))은 P1-1에서 신설됨. 여기서 HNSW + trigram 인덱스만 추가.

-- ─── HNSW (cosine) — 의미 기반 dedup/검색 ──────────────────────
CREATE INDEX IF NOT EXISTS idx_classes_embedding
  ON classes USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_instances_embedding
  ON instances USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── pg_trgm — 이름 오타 매칭 ─────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_classes_name_trgm
  ON classes USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_instances_name_trgm
  ON instances USING gin (name gin_trgm_ops);
