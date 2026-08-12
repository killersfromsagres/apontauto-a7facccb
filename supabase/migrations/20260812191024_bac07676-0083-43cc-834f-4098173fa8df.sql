ALTER TABLE public.talude_marcacoes ADD COLUMN IF NOT EXISTS numero_visivel BOOLEAN DEFAULT TRUE;
ALTER TABLE public.talude_marcacoes ADD COLUMN IF NOT EXISTS data_visivel BOOLEAN DEFAULT TRUE;