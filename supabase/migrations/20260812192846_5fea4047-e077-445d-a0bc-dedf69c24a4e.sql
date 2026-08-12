-- Adicionar colunas ausentes na tabela talude_marcacoes
ALTER TABLE public.talude_marcacoes 
ADD COLUMN IF NOT EXISTS prazo_rotulo TEXT,
ADD COLUMN IF NOT EXISTS prazo_visivel BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS prazo_x FLOAT,
ADD COLUMN IF NOT EXISTS prazo_y FLOAT,
ADD COLUMN IF NOT EXISTS prazo_scale FLOAT DEFAULT 1.0;

-- Garantir acesso às colunas
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_marcacoes TO authenticated;
GRANT ALL ON public.talude_marcacoes TO service_role;
