ALTER TABLE public.corretiva_os ADD COLUMN tipo_importacao text DEFAULT 'padrao';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corretiva_os TO authenticated;
GRANT ALL ON public.corretiva_os TO service_role;