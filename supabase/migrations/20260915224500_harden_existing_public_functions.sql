REVOKE ALL ON FUNCTION public.has_role(uuid,public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.get_my_allowed_menus()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_my_allowed_menus() FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_my_allowed_menus() TO authenticated, service_role';
  END IF;
  IF to_regprocedure('public.refresh_pointing_batch_totals()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.refresh_pointing_batch_totals() FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.refresh_pointing_batch_totals() TO authenticated, service_role';
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.set_updated_at() SET search_path = public';
  END IF;
  IF to_regprocedure('public.sync_agent_heartbeat_columns()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.sync_agent_heartbeat_columns() SET search_path = public';
  END IF;
END $$;
