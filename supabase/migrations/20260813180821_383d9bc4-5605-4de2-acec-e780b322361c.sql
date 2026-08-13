ALTER TABLE public.corretiva_os ADD COLUMN IF NOT EXISTS pecas_solicitadas text;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corretiva_os TO authenticated;
GRANT ALL ON public.corretiva_os TO service_role;