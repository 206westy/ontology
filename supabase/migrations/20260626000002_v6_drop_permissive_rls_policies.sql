-- v6 follow-up: remove leftover permissive "Allow all" RLS policies.
--
-- constraints / validation_results had RLS enabled (since the v3 migration) but
-- also carried a policy `USING (true) WITH CHECK (true)` for ALL commands across
-- ALL roles. That left the anon/publishable key able to read & write those two
-- tables freely, despite RLS being on — inconsistent with the deny-all lockdown
-- applied to the other 12 tables in 20260626000001_v6_enable_rls_lockdown.sql.
--
-- Dropping these policies makes both tables deny-all (RLS on, no policy), like
-- the rest. The app is unaffected: all data access is server-side via Drizzle
-- (role `postgres`, rolbypassrls = true) or the Supabase service-role client,
-- both of which bypass RLS regardless of policies.
--
-- Rollback (re-open to anon — NOT recommended):
--   CREATE POLICY "Allow all on constraints" ON public.constraints
--     FOR ALL USING (true) WITH CHECK (true);
--   CREATE POLICY "Allow all on validation_results" ON public.validation_results
--     FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on constraints" ON public.constraints;
DROP POLICY IF EXISTS "Allow all on validation_results" ON public.validation_results;
