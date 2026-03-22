CREATE TABLE classes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid REFERENCES classes(id) ON DELETE SET NULL,
  name        text NOT NULL,
  description text DEFAULT '',
  color       text NOT NULL DEFAULT '#7c3aed'
                   CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  position_x  float NOT NULL DEFAULT 0,
  position_y  float NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_class_name_per_parent UNIQUE (parent_id, name)
);
CREATE INDEX idx_classes_parent ON classes(parent_id);
