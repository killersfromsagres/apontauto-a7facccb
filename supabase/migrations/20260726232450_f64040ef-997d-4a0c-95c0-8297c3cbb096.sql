
-- 1) has_role sem backdoor de e-mail
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = _role
  );
$function$;

-- 2) storage: remover políticas amplas do bucket talude-maps
DROP POLICY IF EXISTS talude_maps_public_read ON storage.objects;
DROP POLICY IF EXISTS talude_maps_auth_insert ON storage.objects;
DROP POLICY IF EXISTS talude_maps_auth_update ON storage.objects;
DROP POLICY IF EXISTS talude_maps_auth_delete ON storage.objects;

-- 3) corretiva: leitura apenas para autenticados
DROP POLICY IF EXISTS corretiva_equipes_read ON public.corretiva_equipes;
CREATE POLICY corretiva_equipes_read ON public.corretiva_equipes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS corretiva_fotos_read ON public.corretiva_fotos;
CREATE POLICY corretiva_fotos_read ON public.corretiva_fotos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS corretiva_os_read ON public.corretiva_os;
CREATE POLICY corretiva_os_read ON public.corretiva_os FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS corretiva_pecas_read ON public.corretiva_pecas;
CREATE POLICY corretiva_pecas_read ON public.corretiva_pecas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS corretiva_problemas_read ON public.corretiva_problemas;
CREATE POLICY corretiva_problemas_read ON public.corretiva_problemas FOR SELECT TO authenticated USING (true);
