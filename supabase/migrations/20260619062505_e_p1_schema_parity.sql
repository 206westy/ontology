-- PRD-E / P1-1: 6요소 스키마 정합 — 어트리뷰션 신설 + 임베딩 컬럼 + 인스턴스 description.
-- 무손실: 기존 데이터 보존, 기존 provenance 는 attributions 로 백필.

-- ─── 1) instances.description (RAG 문맥) ───────────────────────
ALTER TABLE instances ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
COMMENT ON COLUMN instances.description IS 'RAG 문맥용 설명 — PRD-E P1-1';

-- ─── 2) attributions (다형성 출처) — 1급 횡단 요소 ─────────────
-- 어떤 테이블의 어떤 행이든 출처를 추적: target_table + target_id 다형성 참조.
CREATE TABLE IF NOT EXISTS attributions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table text NOT NULL,
  target_id    uuid NOT NULL,
  source_type  text NOT NULL,
  source_ref   text,
  evidence     text,
  confidence   real,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_attr_source_type
    CHECK (source_type IN ('document', 'sap', 'user', 'web', 'inferred')),
  CONSTRAINT chk_attr_target_table
    CHECK (target_table IN ('classes', 'instances', 'properties', 'edges', 'relation_types', 'axioms', 'constraints')),
  CONSTRAINT chk_attr_confidence
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);
CREATE INDEX IF NOT EXISTS idx_attr_target ON attributions(target_table, target_id);
COMMENT ON TABLE attributions IS '다형성 출처(어트리뷰션) — 6요소 횡단 1급 요소, PRD-E P1-1';

-- ─── 3) 기존 provenance 백필 (무손실) ─────────────────────────
-- classes: sourceType 있으면 그 값, 없으면 'inferred'.
INSERT INTO attributions (target_table, target_id, source_type, evidence, confidence)
SELECT 'classes', c.id, COALESCE(c.source_type, 'inferred'), c.evidence, c.confidence
FROM classes c
WHERE NOT EXISTS (
  SELECT 1 FROM attributions a WHERE a.target_table = 'classes' AND a.target_id = c.id
);

-- edges: sourceType 있으면 그 값, 없으면 'inferred'.
INSERT INTO attributions (target_table, target_id, source_type, evidence, confidence)
SELECT 'edges', e.id, COALESCE(e.source_type, 'inferred'), e.evidence, e.confidence
FROM edges e
WHERE NOT EXISTS (
  SELECT 1 FROM attributions a WHERE a.target_table = 'edges' AND a.target_id = e.id
);

-- instances / relation_types: provenance 컬럼이 없으므로 'inferred' 로 1행씩.
INSERT INTO attributions (target_table, target_id, source_type)
SELECT 'instances', i.id, 'inferred'
FROM instances i
WHERE NOT EXISTS (
  SELECT 1 FROM attributions a WHERE a.target_table = 'instances' AND a.target_id = i.id
);

INSERT INTO attributions (target_table, target_id, source_type)
SELECT 'relation_types', rt.id, 'inferred'
FROM relation_types rt
WHERE NOT EXISTS (
  SELECT 1 FROM attributions a WHERE a.target_table = 'relation_types' AND a.target_id = rt.id
);

-- ─── 4) pgvector + embedding 컬럼 (생성은 P2, 컬럼만 신설) ──────
-- 1536 < HNSW 상한 2000 → 네이티브 인덱싱 가능. 인덱스는 P2-2 로 연기.
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE classes   ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE instances ADD COLUMN IF NOT EXISTS embedding vector(1536);
COMMENT ON COLUMN classes.embedding   IS 'text-embedding-3-small (1536) — 생성은 PRD-E P2';
COMMENT ON COLUMN instances.embedding IS 'text-embedding-3-small (1536) — 생성은 PRD-E P2';
