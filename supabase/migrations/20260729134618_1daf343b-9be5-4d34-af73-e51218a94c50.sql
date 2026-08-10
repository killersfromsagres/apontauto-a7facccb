DROP FUNCTION IF EXISTS public.audit_noop();

CREATE OR REPLACE FUNCTION public.sst_can_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT public.can_access_module('seguranca-trabalho', 'read'); $function$;

CREATE OR REPLACE FUNCTION public.get_my_allowed_menus()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN NULL::text[]
  ELSE COALESCE((SELECT array_agg(DISTINCT s.m) FROM (
      SELECT uma.module_key AS m FROM public.user_module_access uma WHERE uma.user_id = auth.uid()
      UNION
      SELECT p.module_key FROM public.user_pcm_roles ur
        JOIN public.pcm_role_permissions rp ON rp.role_key = ur.role_key
        JOIN public.pcm_permissions p ON p.key = rp.permission_key
       WHERE ur.user_id = auth.uid() AND p.action = 'read') s), ARRAY[]::text[]) END;
$function$;