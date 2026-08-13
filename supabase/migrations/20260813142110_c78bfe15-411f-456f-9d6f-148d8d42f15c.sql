-- Migration: Add extra icon date fields to talude_marcacoes
ALTER TABLE public.talude_marcacoes 
ADD COLUMN IF NOT EXISTS icone_data_x double precision,
ADD COLUMN IF NOT EXISTS icone_data_y double precision,
ADD COLUMN IF NOT EXISTS icone_data_scale double precision DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS icone_data_visivel boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS icone_data_texto text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_marcacoes TO authenticated;
GRANT ALL ON public.talude_marcacoes TO service_role;
GRANT SELECT ON public.talude_marcacoes TO anon;
