-- v4: Add namespace column to classes table for JSON-LD export support
ALTER TABLE classes ADD COLUMN namespace text;

COMMENT ON COLUMN classes.namespace IS 'Optional namespace URI for JSON-LD/RDF export (e.g., http://schema.org/)';
