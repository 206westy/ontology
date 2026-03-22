CREATE TABLE instance_values (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id   uuid NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  value         text,
  CONSTRAINT uq_value_per_instance_property UNIQUE (instance_id, property_id)
);
CREATE INDEX idx_ival_instance ON instance_values(instance_id);
CREATE INDEX idx_ival_property ON instance_values(property_id);
