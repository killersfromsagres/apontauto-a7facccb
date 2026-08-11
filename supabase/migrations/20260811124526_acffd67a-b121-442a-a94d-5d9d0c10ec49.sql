ALTER TABLE public.talude_marcacoes ADD COLUMN IF NOT EXISTS espessura_linha INTEGER DEFAULT 3;
GRANT ALL ON public.talude_marcacoes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_marcacoes TO authenticated;
