ALTER TABLE public.rondas_calhas ADD COLUMN IF NOT EXISTS fotos_antes text[] DEFAULT '{}';
ALTER TABLE public.rondas_calhas ADD COLUMN IF NOT EXISTS fotos_depois text[] DEFAULT '{}';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rondas_calhas TO authenticated;
GRANT ALL ON public.rondas_calhas TO service_role;
GRANT SELECT ON public.rondas_calhas TO anon;