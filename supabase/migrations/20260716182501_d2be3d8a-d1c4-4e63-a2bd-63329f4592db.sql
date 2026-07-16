
-- 1) Novos campos em backorder_os
ALTER TABLE public.backorder_os
  ADD COLUMN IF NOT EXISTS is_prioridade boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_prioridade text,
  ADD COLUMN IF NOT EXISTS prioridade_nivel integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prioridade_scanned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_backorder_os_prioridade ON public.backorder_os (is_prioridade) WHERE is_prioridade = true;

-- 2) Configuração do motor (singleton — id=1)
CREATE TABLE IF NOT EXISTS public.backorder_prioridade_config (
  id smallint PRIMARY KEY DEFAULT 1,
  predios_sensiveis jsonb NOT NULL DEFAULT '[]'::jsonb,
  keyword_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  dias_forca_prioridade integer NOT NULL DEFAULT 60,
  familias_habilitadas jsonb NOT NULL DEFAULT '{"higiene":true,"cozinha":true,"seguranca":true,"criticidade":true,"tempo":true}'::jsonb,
  last_scan_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backorder_prioridade_config TO authenticated;
GRANT ALL ON public.backorder_prioridade_config TO service_role;

ALTER TABLE public.backorder_prioridade_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read config" ON public.backorder_prioridade_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write config" ON public.backorder_prioridade_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Semente padrão
INSERT INTO public.backorder_prioridade_config (id, predios_sensiveis, keyword_rules)
VALUES (
  1,
  '[{"predio":"C70","motivo":"Área de Cozinha","nivel":3}]'::jsonb,
  '[
    {"familia":"higiene","nivel":3,"label":"Higiene/Saúde","keywords":["sanitario entupido","entupimento","vazamento de esgoto","esgoto","mau cheiro","falta de agua","contaminacao","banheiro entupido"]},
    {"familia":"seguranca","nivel":3,"label":"Risco Operacional","keywords":["fio exposto","cabo exposto","curto circuito","principio de incendio","vazamento de gas","estrutura comprometida","porta de emergencia","risco de queda"]},
    {"familia":"cozinha","nivel":2,"label":"Área de Cozinha","keywords":["cozinha","refeitorio","copa","restaurante","camara fria"]}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
