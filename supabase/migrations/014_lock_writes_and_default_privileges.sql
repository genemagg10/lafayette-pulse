-- 014: Lock Data API writes on app tables + explicit-grants model (Supabase Oct 30, 2026 change).
-- Idempotent.
--
-- Why:
--   001/005 created policy "Service write" FOR ALL TO public USING (true) WITH CHECK (true)
--   on projects, project_updates, agenda_items, document_chunks, scraped_sources. Together with
--   the default anon/authenticated INSERT/UPDATE/DELETE grants, anyone holding the anon key
--   could write/delete rows. service_role bypasses RLS, so the scrapers never needed it.
--   App code reads only (anon key); all writes come from scripts using the service-role key.
--
--   From Oct 30, 2026 Supabase no longer auto-grants Data API access on new public tables.
--   This migration makes grants explicit for existing tables (so local `supabase db reset` and
--   preview branches match prod) and sets default privileges so new tables are NOT exposed to
--   anon/authenticated until a migration grants it.

-- ============================================
-- A. Remove anon/authenticated write paths
-- ============================================
DROP POLICY IF EXISTS "Service write" ON public.projects;
DROP POLICY IF EXISTS "Service write" ON public.project_updates;
DROP POLICY IF EXISTS "Service write" ON public.agenda_items;
DROP POLICY IF EXISTS "Service write" ON public.document_chunks;
DROP POLICY IF EXISTS "Service write" ON public.scraped_sources;

-- /api/health reads scraped_sources.scraped_at with the anon key; keep it readable.
DROP POLICY IF EXISTS "Public read access" ON public.scraped_sources;
CREATE POLICY "Public read access" ON public.scraped_sources
  FOR SELECT TO anon, authenticated USING (true);

-- Read-only app tables: anon/authenticated SELECT only; service_role full.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'projects','project_updates','agenda_items','scraped_sources','document_chunks',
    'people','organizations','memberships','seats','seat_holders','events',
    'measures','candidacies','stances'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon, authenticated, PUBLIC', t);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;

-- Sequences of those tables: API roles never insert.
DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['projects_id_seq','project_updates_id_seq','agenda_items_id_seq',
                           'scraped_sources_id_seq','document_chunks_id_seq'] LOOP
    IF to_regclass('public.' || s) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon, authenticated, PUBLIC', s);
      EXECUTE format('GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.%I TO service_role', s);
    END IF;
  END LOOP;
END $$;

-- civic_graph_proposals stays service_role only (see 013).
DO $$
BEGIN
  IF to_regclass('public.civic_graph_proposals') IS NOT NULL THEN
    GRANT ALL ON TABLE public.civic_graph_proposals TO service_role;
  END IF;
END $$;

-- Ask / RAG calls match_documents with the anon key.
DO $$
BEGIN
  IF to_regprocedure('public.match_documents(vector, integer, project_category, text, date)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.match_documents(vector, integer, project_category, text, date)
      TO anon, authenticated, service_role;
  END IF;
END $$;

-- ============================================
-- D. Default privileges: explicit-grants model
-- New tables/sequences/functions created by postgres in public get no anon/authenticated
-- access; add GRANTs in the migration that creates them. service_role keeps defaults.
-- ============================================
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
-- PUBLIC's EXECUTE on functions is a global default; it can only be removed globally
-- (applies to functions postgres creates in any schema).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
