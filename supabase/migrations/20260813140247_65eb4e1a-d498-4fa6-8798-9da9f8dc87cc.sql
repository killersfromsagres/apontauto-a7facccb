ALTER TABLE public.talude_marcacoes 
ADD COLUMN IF NOT EXISTS icone_tipo text,
ADD COLUMN IF NOT EXISTS icone_x float8,
ADD COLUMN IF NOT EXISTS icone_y float8,
ADD COLUMN IF NOT EXISTS icone_scale float8 DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS icone_visivel boolean DEFAULT true;

-- Grant permissions to make sure the schema cache updates
GRANT ALL ON public.talude_marcacoes TO authenticated;
GRANT ALL ON public.talude_marcacoes TO service_role;
GRANT ALL ON public.talude_marcacoes TO anon;