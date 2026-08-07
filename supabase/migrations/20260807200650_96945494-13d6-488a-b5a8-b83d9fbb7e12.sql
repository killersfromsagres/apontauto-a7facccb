-- Explicitly grant permissions to authenticated and service_role for talude tables
-- These grants were missing from the information_schema check, which is a common cause for "no results" in the UI.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_maps TO authenticated;
GRANT ALL ON public.talude_maps TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_marcacoes TO authenticated;
GRANT ALL ON public.talude_marcacoes TO service_role;

GRANT SELECT, INSERT ON public.talude_map_versions TO authenticated;
GRANT ALL ON public.talude_map_versions TO service_role;

GRANT SELECT, INSERT ON public.talude_geometry_events TO authenticated;
GRANT ALL ON public.talude_geometry_events TO service_role;

-- Ensure the RLS policies also allow admins to see everything
-- Re-creating select policies to include admin bypass

DROP POLICY IF EXISTS "Own maps: select" ON public.talude_maps;
CREATE POLICY "Maps: select" ON public.talude_maps 
  FOR SELECT TO authenticated 
  USING (
    auth.uid() = owner_id 
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Own marc: select" ON public.talude_marcacoes;
CREATE POLICY "Marc: select" ON public.talude_marcacoes 
  FOR SELECT TO authenticated 
  USING (
    auth.uid() = owner_id 
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
