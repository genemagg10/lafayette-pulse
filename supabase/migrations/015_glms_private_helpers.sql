-- 015: Move GLMS RLS helper out of the exposed public schema + RLS initplan fix.
-- Idempotent. No-op where the GLMS task-board objects do not exist (e.g. fresh local DB;
-- the glms_* schema was applied directly to prod and is not in this repo's migrations).
--
-- glms_is_member() is SECURITY DEFINER and is evaluated inside the RLS policies of
-- glms_meetings, glms_meeting_items, glms_meta, glms_tasks, glms_task_events, so
-- `authenticated` must keep EXECUTE. Moving it to `private` (not exposed by PostgREST)
-- removes the /rest/v1/rpc/glms_is_member surface. Policies reference the function by OID,
-- so ALTER ... SET SCHEMA keeps them working (they now deparse as private.glms_is_member()).

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.glms_is_member()') IS NOT NULL
     AND to_regprocedure('private.glms_is_member()') IS NULL THEN
    ALTER FUNCTION public.glms_is_member() SET SCHEMA private;
  END IF;

  IF to_regprocedure('private.glms_is_member()') IS NOT NULL THEN
    -- Body is fully qualified (public.glms_members, auth.jwt()).
    ALTER FUNCTION private.glms_is_member() SET search_path = '';
    REVOKE EXECUTE ON FUNCTION private.glms_is_member() FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION private.glms_is_member() TO authenticated, service_role;
  END IF;
END $$;

-- auth_rls_initplan: evaluate auth.jwt() once per statement, not per row.
DO $$
BEGIN
  IF to_regclass('public.glms_members') IS NOT NULL THEN
    DROP POLICY IF EXISTS glms_members_self ON public.glms_members;
    CREATE POLICY glms_members_self ON public.glms_members
      FOR SELECT TO authenticated
      USING (lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', '')));
  END IF;
END $$;
