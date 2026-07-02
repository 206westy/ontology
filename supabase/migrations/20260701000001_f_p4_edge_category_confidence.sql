-- PRD-F P4-1: 관계 category 판정 확신도(저신뢰는 traversal 비우선, 값은 보존).
-- 무손실·후방호환: nullable 컬럼 추가만. 기존 category 제약(chk_relation_category)은
-- 불변(신규 enum 값 없음).
ALTER TABLE edges ADD COLUMN IF NOT EXISTS category_confidence real;

COMMENT ON COLUMN edges.category_confidence IS
  'PRD-F P4-1: 0..1 category 판정 확신도. < 0.7 은 저신뢰(Critic 검수 큐·traversal 비우선). NULL = 미측정.';
