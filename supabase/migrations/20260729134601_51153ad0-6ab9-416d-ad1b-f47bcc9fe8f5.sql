CREATE OR REPLACE FUNCTION public.can_access_module(module_key text, required_action text DEFAULT 'read'::text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_action text := coalesce(nullif(btrim(required_action), ''), 'read');
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF public.has_role(v_uid, 'admin'::public.app_role) THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_pcm_roles ur
      JOIN public.pcm_role_permissions rp ON rp.role_key = ur.role_key
      JOIN public.pcm_permissions p ON p.key = rp.permission_key
     WHERE ur.user_id = v_uid AND p.module_key = can_access_module.module_key AND p.action = v_action
  ) THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_module_access uma
     WHERE uma.user_id = v_uid AND uma.module_key = can_access_module.module_key
       AND (v_action = ANY (uma.actions) OR 'all' = ANY (uma.actions))
  ) THEN RETURN true; END IF;
  RETURN false;
END;
$function$;