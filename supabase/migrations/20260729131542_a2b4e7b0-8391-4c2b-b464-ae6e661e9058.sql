CREATE OR REPLACE FUNCTION public.can_access_module(module_key text, required_action text DEFAULT 'read'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_action text := coalesce(nullif(btrim(required_action), ''), 'read');
  v_menus text[];
  v_restricted text[] := ARRAY[
    'abastecimento','frota-checklist','frota-historico','frota-gestao',
    'bi-studio','notificacoes-admin','auditoria','confiabilidade'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(v_uid, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.user_pcm_roles ur
      JOIN public.pcm_role_permissions rp ON rp.role_key = ur.role_key
      JOIN public.pcm_permissions p ON p.key = rp.permission_key
     WHERE ur.user_id = v_uid
       AND p.module_key = can_access_module.module_key
       AND p.action = v_action
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_module_access uma
     WHERE uma.user_id = v_uid
       AND uma.module_key = can_access_module.module_key
       AND (v_action = ANY (uma.actions) OR 'all' = ANY (uma.actions))
  ) THEN
    RETURN true;
  END IF;

  IF can_access_module.module_key = ANY (v_restricted) THEN
    RETURN false;
  END IF;

  -- Negação por padrão: sem lista explícita de menus, não há acesso.
  SELECT p.allowed_menus INTO v_menus
    FROM public.profiles p WHERE p.id = v_uid;

  IF v_menus IS NOT NULL AND can_access_module.module_key = ANY (v_menus) THEN
    RETURN v_action <> 'admin';
  END IF;

  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_allowed_menus()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN NULL::text[]
    ELSE COALESCE(
      (SELECT p.allowed_menus FROM public.profiles p WHERE p.id = auth.uid()),
      ARRAY[]::text[]
    )
  END;
$function$;

CREATE INDEX IF NOT EXISTS user_module_access_user_module_idx
  ON public.user_module_access (user_id, module_key);
CREATE INDEX IF NOT EXISTS user_pcm_roles_user_idx
  ON public.user_pcm_roles (user_id);
CREATE INDEX IF NOT EXISTS user_roles_user_role_idx
  ON public.user_roles (user_id, role);