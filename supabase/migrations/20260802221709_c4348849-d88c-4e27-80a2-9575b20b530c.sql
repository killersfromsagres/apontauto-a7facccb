CREATE OR REPLACE FUNCTION public.agua_exec_can(required_action text DEFAULT 'read')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.agua_can(required_action)
      OR (required_action IN ('read', 'create', 'update')
          AND public.can_access_module('agua-execucao', required_action));
$$;

GRANT EXECUTE ON FUNCTION public.agua_exec_can(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "agua_prog_pontos_auth" ON public.agua_prog_pontos;
DROP POLICY IF EXISTS "agua_prog_pontos_select" ON public.agua_prog_pontos;
DROP POLICY IF EXISTS "agua_prog_pontos_insert" ON public.agua_prog_pontos;
DROP POLICY IF EXISTS "agua_prog_pontos_update" ON public.agua_prog_pontos;
DROP POLICY IF EXISTS "agua_prog_pontos_delete" ON public.agua_prog_pontos;

CREATE POLICY "agua_prog_pontos_select" ON public.agua_prog_pontos
  FOR SELECT TO authenticated USING (public.agua_exec_can('read'));
CREATE POLICY "agua_prog_pontos_insert" ON public.agua_prog_pontos
  FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_prog_pontos_update" ON public.agua_prog_pontos
  FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_prog_pontos_delete" ON public.agua_prog_pontos
  FOR DELETE TO authenticated USING (public.agua_is_gestor());

DROP POLICY IF EXISTS "agua_prog_entregas_auth" ON public.agua_prog_entregas;
DROP POLICY IF EXISTS "agua_prog_entregas_select" ON public.agua_prog_entregas;
DROP POLICY IF EXISTS "agua_prog_entregas_insert" ON public.agua_prog_entregas;
DROP POLICY IF EXISTS "agua_prog_entregas_update" ON public.agua_prog_entregas;
DROP POLICY IF EXISTS "agua_prog_entregas_delete" ON public.agua_prog_entregas;

CREATE POLICY "agua_prog_entregas_select" ON public.agua_prog_entregas
  FOR SELECT TO authenticated USING (public.agua_exec_can('read'));
CREATE POLICY "agua_prog_entregas_insert" ON public.agua_prog_entregas
  FOR INSERT TO authenticated WITH CHECK (public.agua_exec_can('create'));
CREATE POLICY "agua_prog_entregas_update" ON public.agua_prog_entregas
  FOR UPDATE TO authenticated USING (public.agua_exec_can('update')) WITH CHECK (public.agua_exec_can('update'));
CREATE POLICY "agua_prog_entregas_delete" ON public.agua_prog_entregas
  FOR DELETE TO authenticated USING (public.agua_exec_can('update'));

DROP POLICY IF EXISTS "agua_prog_fotos_auth" ON public.agua_prog_fotos;
DROP POLICY IF EXISTS "agua_prog_fotos_select" ON public.agua_prog_fotos;
DROP POLICY IF EXISTS "agua_prog_fotos_insert" ON public.agua_prog_fotos;
DROP POLICY IF EXISTS "agua_prog_fotos_update" ON public.agua_prog_fotos;
DROP POLICY IF EXISTS "agua_prog_fotos_delete" ON public.agua_prog_fotos;

CREATE POLICY "agua_prog_fotos_select" ON public.agua_prog_fotos
  FOR SELECT TO authenticated USING (public.agua_exec_can('read'));
CREATE POLICY "agua_prog_fotos_insert" ON public.agua_prog_fotos
  FOR INSERT TO authenticated WITH CHECK (public.agua_exec_can('create'));
CREATE POLICY "agua_prog_fotos_update" ON public.agua_prog_fotos
  FOR UPDATE TO authenticated USING (public.agua_exec_can('update')) WITH CHECK (public.agua_exec_can('update'));
CREATE POLICY "agua_prog_fotos_delete" ON public.agua_prog_fotos
  FOR DELETE TO authenticated USING (public.agua_exec_can('update'));