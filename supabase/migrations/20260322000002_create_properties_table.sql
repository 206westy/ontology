CREATE TABLE properties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name            text NOT NULL,
  data_type       text NOT NULL DEFAULT 'string'
                       CHECK (data_type IN ('string','integer','float','boolean','date','enum')),
  is_required     boolean NOT NULL DEFAULT false,
  enum_values     jsonb DEFAULT NULL
                       CHECK (data_type != 'enum' OR (enum_values IS NOT NULL AND jsonb_array_length(enum_values) > 0)),
  constraint_rule jsonb DEFAULT NULL,
  sort_order      integer NOT NULL DEFAULT 0,
  CONSTRAINT uq_property_per_class UNIQUE (class_id, name)
);
CREATE INDEX idx_properties_class ON properties(class_id);
