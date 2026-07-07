-- PRD-L M2: 관계 5분류(category) → 2레이어(layer: semantic|kinetic).
-- semantic = 지식·서술(구 structural/causal/descriptive)
-- kinetic  = 행동·조치(구 diagnostic/procedural)
-- 그린필드: categoryConfidence(edges.category_confidence)는 제거.

ALTER TABLE relation_types ADD COLUMN IF NOT EXISTS layer text;

UPDATE relation_types SET layer = CASE
  WHEN category IN ('diagnostic', 'procedural') THEN 'kinetic'
  ELSE 'semantic'
END;

ALTER TABLE relation_types ALTER COLUMN layer SET NOT NULL;
ALTER TABLE relation_types ALTER COLUMN layer SET DEFAULT 'semantic';
ALTER TABLE relation_types ADD CONSTRAINT chk_relation_layer CHECK (layer IN ('semantic', 'kinetic'));

ALTER TABLE relation_types DROP CONSTRAINT IF EXISTS chk_relation_category;
ALTER TABLE relation_types DROP COLUMN IF EXISTS category;

ALTER TABLE edges DROP COLUMN IF EXISTS category_confidence;
