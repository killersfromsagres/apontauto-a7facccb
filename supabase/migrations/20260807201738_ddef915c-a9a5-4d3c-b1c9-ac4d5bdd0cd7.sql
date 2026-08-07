
-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_maps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_marcacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_map_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_geometry_events TO authenticated;

GRANT ALL ON public.talude_maps TO service_role;
GRANT ALL ON public.talude_marcacoes TO service_role;
GRANT ALL ON public.talude_map_versions TO service_role;
GRANT ALL ON public.talude_geometry_events TO service_role;

GRANT SELECT ON public.talude_maps TO anon;
GRANT SELECT ON public.talude_marcacoes TO anon;

-- Ensure RLS is enabled
ALTER TABLE public.talude_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talude_marcacoes ENABLE ROW LEVEL SECURITY;

-- Re-create policies to be more permissive for initial troubleshooting
DROP POLICY IF EXISTS "Maps: select" ON public.talude_maps;
CREATE POLICY "Maps: select" ON public.talude_maps 
FOR SELECT TO authenticated, anon 
USING (true);

DROP POLICY IF EXISTS "Marc: select" ON public.talude_marcacoes;
CREATE POLICY "Marc: select" ON public.talude_marcacoes 
FOR SELECT TO authenticated, anon 
USING (true);

DROP POLICY IF EXISTS "Maps: insert" ON public.talude_maps;
CREATE POLICY "Maps: insert" ON public.talude_maps 
FOR INSERT TO authenticated 
WITH CHECK (true);

DROP POLICY IF EXISTS "Marc: insert" ON public.talude_marcacoes;
CREATE POLICY "Marc: insert" ON public.talude_marcacoes 
FOR INSERT TO authenticated 
WITH CHECK (true);

DROP POLICY IF EXISTS "Maps: update" ON public.talude_maps;
CREATE POLICY "Maps: update" ON public.talude_maps 
FOR UPDATE TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Marc: update" ON public.talude_marcacoes;
CREATE POLICY "Marc: update" ON public.talude_marcacoes 
FOR UPDATE TO authenticated 
USING (true);
