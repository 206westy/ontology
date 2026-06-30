-- PR1 (목표①): relation_types 에 액션 지향 분류(category) 추가.
-- 가산적·비파괴 마이그레이션: NOT NULL + DEFAULT 'descriptive' 로 기존 row 자동 백필.
-- 기존 술어의 의미는 미상이므로 인과/구조를 단정하지 않는 'descriptive' 로 백필한다
-- (이후 사용자가 ER/거버넌스에서 재분류). Drizzle schema(src/lib/drizzle/schema.ts)와 정합.
--
-- 적용: Supabase MCP `apply_migration` 또는 Management API 로 실행
--       (프로젝트 ref: mcxeejatzzotfskkwvyb).

ALTER TABLE relation_types
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'descriptive';

-- 액션 지향 5분류만 허용.
ALTER TABLE relation_types
  DROP CONSTRAINT IF EXISTS chk_relation_category;

ALTER TABLE relation_types
  ADD CONSTRAINT chk_relation_category
  CHECK (category IN ('structural', 'causal', 'diagnostic', 'procedural', 'descriptive'));
