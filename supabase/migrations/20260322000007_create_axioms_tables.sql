CREATE TABLE axioms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  rule_logic  jsonb NOT NULL DEFAULT '{}',
  severity    text NOT NULL DEFAULT 'warning'
                   CHECK (severity IN ('info', 'warning', 'error')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE axiom_classes (
  axiom_id  uuid NOT NULL REFERENCES axioms(id) ON DELETE CASCADE,
  class_id  uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (axiom_id, class_id)
);
CREATE INDEX idx_ac_class ON axiom_classes(class_id);
