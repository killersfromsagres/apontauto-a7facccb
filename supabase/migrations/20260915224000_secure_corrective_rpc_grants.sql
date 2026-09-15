REVOKE ALL ON FUNCTION public.finalize_corretiva_os(uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.user_can_access(text) FROM anon;
REVOKE ALL ON FUNCTION public.user_can_access_any(text[]) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(uuid,public.app_role) FROM anon;

DO $$
BEGIN
  IF to_regprocedure('public.get_my_allowed_menus()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_my_allowed_menus() FROM anon';
  END IF;
  IF to_regprocedure('public.refresh_pointing_batch_totals()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.refresh_pointing_batch_totals() FROM anon';
  END IF;
END $$;
