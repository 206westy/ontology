CREATE TABLE relation_types (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL UNIQUE,
  description      text DEFAULT '',
  source_class_id  uuid REFERENCES classes(id) ON DELETE SET NULL,
  target_class_id  uuid REFERENCES classes(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
