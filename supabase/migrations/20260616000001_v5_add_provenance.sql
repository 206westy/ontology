-- v5 (PRD-A / A-4): lightweight provenance on classes and edges.
-- All nullable — existing rows and non-enriched writes are unaffected.
-- source_type: where the value/relation came from
--   ('existing_graph' | 'session_doc' | 'web' | 'inferred')
-- confidence: 0..1 confidence of the extraction/enrichment
-- evidence: short source span / justification text

ALTER TABLE classes ADD COLUMN source_type text;
ALTER TABLE classes ADD COLUMN confidence real;
ALTER TABLE classes ADD COLUMN evidence text;

ALTER TABLE edges ADD COLUMN source_type text;
ALTER TABLE edges ADD COLUMN confidence real;
ALTER TABLE edges ADD COLUMN evidence text;

COMMENT ON COLUMN classes.source_type IS 'Provenance: existing_graph | session_doc | web | inferred (PRD-A A-4)';
COMMENT ON COLUMN classes.confidence IS 'Provenance: 0..1 confidence of extraction/enrichment (PRD-A A-4)';
COMMENT ON COLUMN classes.evidence IS 'Provenance: source span / justification (PRD-A A-4)';
COMMENT ON COLUMN edges.source_type IS 'Provenance: existing_graph | session_doc | web | inferred (PRD-A A-4)';
COMMENT ON COLUMN edges.confidence IS 'Provenance: 0..1 confidence of extraction/enrichment (PRD-A A-4)';
COMMENT ON COLUMN edges.evidence IS 'Provenance: source span / justification (PRD-A A-4)';
