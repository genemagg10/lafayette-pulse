-- Security advisor hardening (project kcrhxkebazpospwljpit).
-- Idempotent. Does not drop PostGIS or change public row visibility.
--
-- Finding triage (live get_advisors security, 2026-09-19):
--
-- ERROR public.spatial_ref_sys RLS Disabled
--   PostGIS catalog of EPSG defs, owned by supabase_admin. Not app data.
--   Enabling RLS fails ("must be owner"). Relocating PostGIS requires
--   DROP EXTENSION CASCADE + recreate, which would break geometry
--   columns. Safe fix: revoke Data API grants from anon/authenticated.
--   The ERROR lint may remain until PostGIS is moved out of public
--   (Supabase Support can relocate without drop) or the linter excludes
--   this table. See https://supabase.com/docs/guides/database/extensions/postgis
--
-- WARN postgis installed in public
--   Same relocation risk. Left in place on purpose. New installs should
--   use CREATE EXTENSION postgis WITH SCHEMA extensions (see 001).
--
-- WARN mutable search_path on update_geom, update_updated_at, match_documents
--   Pin search_path so trigger / RPC bodies cannot be redirected.
--
-- WARN anon/authenticated can EXECUTE SECURITY DEFINER
--   rls_auto_enable() is an event-trigger helper, not an app RPC.
--   st_estimatedextent(*) is PostGIS; the app never calls it. Revoke.
--   match_documents stays executable for anon — Ask / RAG uses the
--   anon key via supabase.rpc("match_documents").
--
-- INFO civic_graph_proposals RLS enabled, no policies
--   Intentional lock-down: only service_role (extract scripts) reads
--   or writes. Add explicit deny policies for API roles and revoke
--   table grants so the table is not exposed via PostgREST.

-- ============================================
-- PostGIS catalog: hide from Data API roles
-- Only when those objects still live in public (production today).
-- Fresh installs put PostGIS in extensions (001) and skip this block.
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.spatial_ref_sys') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon, authenticated, PUBLIC;
  END IF;
  IF to_regclass('public.geometry_columns') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.geometry_columns FROM anon, authenticated, PUBLIC;
  END IF;
  IF to_regclass('public.geography_columns') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.geography_columns FROM anon, authenticated, PUBLIC;
  END IF;
END $$;

-- ============================================
-- App functions: pin search_path
-- public + extensions covers PostGIS-in-public today and pgvector
-- (installed in extensions). Unqualified ST_* / <=> keep working.
-- ============================================
CREATE OR REPLACE FUNCTION public.update_geom()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding vector(1536),
  match_count INT DEFAULT 10,
  filter_category project_category DEFAULT NULL,
  filter_body TEXT DEFAULT NULL,
  filter_after DATE DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  source_table TEXT,
  source_id BIGINT,
  category project_category,
  meeting_body TEXT,
  meeting_date DATE,
  project_title TEXT,
  source_url TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id, dc.content, dc.source_table, dc.source_id,
    dc.category, dc.meeting_body, dc.meeting_date,
    dc.project_title, dc.source_url,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks dc
  WHERE
    dc.embedding IS NOT NULL
    AND (filter_category IS NULL OR dc.category = filter_category)
    AND (filter_body IS NULL OR dc.meeting_body ILIKE '%' || filter_body || '%')
    AND (filter_after IS NULL OR dc.meeting_date >= filter_after)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- RAG / Ask uses the anon key. Keep RPC callable; do not tighten further.
GRANT EXECUTE ON FUNCTION public.match_documents(vector, integer, project_category, text, date)
  TO anon, authenticated, service_role;

-- ============================================
-- SECURITY DEFINER: revoke public RPC
-- rls_auto_enable is a hosted-project event trigger (not in 001–012).
-- st_estimatedextent overloads exist in public only while PostGIS is there.
-- ============================================
DO $$
DECLARE
  fn record;
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;

  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'st_estimatedextent'
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      fn.sig
    );
  END LOOP;
END $$;

-- ============================================
-- civic_graph_proposals: deny API roles, keep service_role
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.civic_graph_proposals') IS NULL THEN
    RAISE NOTICE 'civic_graph_proposals missing; skip RLS/grant hardening';
    RETURN;
  END IF;

  REVOKE ALL ON TABLE public.civic_graph_proposals FROM anon, authenticated, PUBLIC;
  GRANT ALL ON TABLE public.civic_graph_proposals TO service_role;
END $$;

DO $$
BEGIN
  IF to_regclass('public.civic_graph_proposals') IS NULL THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "Deny all to anon" ON public.civic_graph_proposals;
  CREATE POLICY "Deny all to anon"
    ON public.civic_graph_proposals
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

  DROP POLICY IF EXISTS "Deny all to authenticated" ON public.civic_graph_proposals;
  CREATE POLICY "Deny all to authenticated"
    ON public.civic_graph_proposals
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);
END $$;
