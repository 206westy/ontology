-- v5 (PRD-B / B-1): 구획(Named Graph) 논리 분리.
-- 모든 노드/엣지에 partition_id 를 두어 같은 그래프 안에서 도메인을 격리한다.
-- 구획 간 연결은 bridge 엣지(is_bridge=true)로만. (Community 단일 DB → 라벨/속성 방식)
-- 기존 데이터 무손실: 전체를 기본 구획에 귀속.

-- 1) partitions 테이블
CREATE TABLE IF NOT EXISTS partitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  color       text NOT NULL DEFAULT '#2563eb',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_partition_name UNIQUE (name),
  CONSTRAINT chk_partition_color_hex CHECK (color ~ '^#[0-9a-fA-F]{6}$')
);

-- 2) 기본 구획 (고정 UUID — 코드의 DEFAULT_PARTITION_ID 와 일치)
INSERT INTO partitions (id, name, description, color)
VALUES ('00000000-0000-0000-0000-000000000001', 'PSK PEE Domain', '기본 구획 (마이그레이션 시 기존 전체 귀속)', '#2563eb')
ON CONFLICT (id) DO NOTHING;

-- 3) classes.partition_id (먼저 nullable 추가 → 백필 → NOT NULL + FK)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS partition_id uuid;
UPDATE classes SET partition_id = '00000000-0000-0000-0000-000000000001' WHERE partition_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_classes_partition' AND table_name = 'classes'
  ) THEN
    ALTER TABLE classes
      ADD CONSTRAINT fk_classes_partition
      FOREIGN KEY (partition_id) REFERENCES partitions(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE classes ALTER COLUMN partition_id SET NOT NULL;
ALTER TABLE classes ALTER COLUMN partition_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
CREATE INDEX IF NOT EXISTS idx_classes_partition ON classes(partition_id);

-- 4) edges.is_bridge — source/target 구획이 다르면 true (구획 간 연결)
ALTER TABLE edges ADD COLUMN IF NOT EXISTS is_bridge boolean NOT NULL DEFAULT false;

COMMENT ON TABLE partitions IS '구획(Named Graph 논리 분리) — PRD-B B-1';
COMMENT ON COLUMN classes.partition_id IS '소속 구획 (NOT NULL, 기본 구획으로 백필) — PRD-B B-1';
COMMENT ON COLUMN edges.is_bridge IS '구획 간 연결(bridge) 여부 — PRD-B B-1';
