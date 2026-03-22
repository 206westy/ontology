-- Add Neo4j push tracking columns to commits table
-- These columns may already exist if the original migration included them;
-- using ADD COLUMN IF NOT EXISTS for idempotency.
ALTER TABLE commits
  ADD COLUMN IF NOT EXISTS pushed_to_neo4j boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pushed_at        timestamptz;
