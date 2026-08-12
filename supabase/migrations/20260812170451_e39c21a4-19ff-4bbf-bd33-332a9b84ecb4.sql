ALTER TABLE public.talude_marcacoes 
ADD COLUMN IF NOT EXISTS numero_x FLOAT8,
ADD COLUMN IF NOT EXISTS numero_y FLOAT8,
ADD COLUMN IF NOT EXISTS numero_scale FLOAT8 DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS data_x FLOAT8,
ADD COLUMN IF NOT EXISTS data_y FLOAT8,
ADD COLUMN IF NOT EXISTS data_scale FLOAT8 DEFAULT 1.0;

COMMENT ON COLUMN public.talude_marcacoes.numero_x IS 'Posição X manual do número do talude no mapa';
COMMENT ON COLUMN public.talude_marcacoes.numero_y IS 'Posição Y manual do número do talude no mapa';
COMMENT ON COLUMN public.talude_marcacoes.numero_scale IS 'Escala manual do número do talude';
COMMENT ON COLUMN public.talude_marcacoes.data_x IS 'Posição X manual da data/status no mapa';
COMMENT ON COLUMN public.talude_marcacoes.data_y IS 'Posição Y manual da data/status no mapa';
COMMENT ON COLUMN public.talude_marcacoes.data_scale IS 'Escala manual da data/status';