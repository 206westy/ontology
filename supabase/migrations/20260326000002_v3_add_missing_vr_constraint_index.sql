-- Fix: validation_results.constraint_id FK 인덱스 누락 (Supabase advisor 권고)
CREATE INDEX idx_vr_constraint ON validation_results(constraint_id) WHERE constraint_id IS NOT NULL;
