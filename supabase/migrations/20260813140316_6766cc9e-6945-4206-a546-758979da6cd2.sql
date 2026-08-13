-- Force cache refresh by performing a small modification and reapplying grants
ALTER TABLE public.talude_marcacoes ALTER COLUMN icone_tipo SET DATA TYPE text;
ALTER TABLE public.talude_marcacoes ALTER COLUMN icone_scale SET DEFAULT 1.0;
ALTER TABLE public.talude_marcacoes ALTER COLUMN icone_visivel SET DEFAULT true;

-- Re-apply grants explicitly to trigger PostgREST schema reload
GRANT ALL ON public.talude_marcacoes TO authenticated;
GRANT ALL ON public.talude_marcacoes TO service_role;
GRANT ALL ON public.talude_marcacoes TO anon;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';