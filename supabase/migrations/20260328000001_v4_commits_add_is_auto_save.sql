-- v4: Add is_auto_save flag to commits table for auto-save support
ALTER TABLE commits ADD COLUMN is_auto_save boolean NOT NULL DEFAULT false;

-- Index for filtering auto-save vs manual commits
CREATE INDEX idx_commits_is_auto_save ON commits (is_auto_save);

COMMENT ON COLUMN commits.is_auto_save IS 'True if this commit was created by auto-save, false for manual commits';
