-- v6: Re-enable Row Level Security (RLS) on all application tables.
--
-- Security advisory: 12 public tables had RLS disabled, so anyone holding the
-- anon/publishable key could read or write every row directly via the Supabase
-- REST/JS client. This migration closes that hole.
--
-- Why "deny-all" (ENABLE without policies) is correct AND safe here:
--   - ALL data access is server-side:
--       * Drizzle via DATABASE_URL  -> role `postgres` (rolbypassrls = true, table owner)
--       * Supabase server client    -> SERVICE_ROLE_KEY (bypasses RLS)
--     Both bypass RLS regardless of policies, so the app keeps full access.
--   - The anon browser client (@/lib/supabase/client) is NOT used for any table
--     CRUD (verified: zero imports, zero `.from('<table>')` table reads/writes).
--   - With RLS enabled and no policy, the `anon`/`authenticated` roles get
--     deny-all -> the exposure is removed.
--
-- IMPORTANT: plain ENABLE (NOT `FORCE`). FORCE would apply RLS even to the table
-- owner/bypassrls roles and would lock out Drizzle. Do not add FORCE.
--
-- Reverses: 20260322000009_create_triggers_and_disable_rls.sql
-- To roll back: ALTER TABLE <t> DISABLE ROW LEVEL SECURITY; (per table)

ALTER TABLE classes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties         ENABLE ROW LEVEL SECURITY;
ALTER TABLE instances          ENABLE ROW LEVEL SECURITY;
ALTER TABLE instance_values    ENABLE ROW LEVEL SECURITY;
ALTER TABLE relation_types     ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges              ENABLE ROW LEVEL SECURITY;
ALTER TABLE axioms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE axiom_classes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE commits            ENABLE ROW LEVEL SECURITY;
ALTER TABLE commit_details     ENABLE ROW LEVEL SECURITY;
ALTER TABLE partitions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE attributions       ENABLE ROW LEVEL SECURITY;

-- Already enabled in earlier migrations (idempotent, kept for completeness):
ALTER TABLE constraints        ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_results ENABLE ROW LEVEL SECURITY;
