
-- 1) assets_ref: novas colunas hierárquicas
ALTER TABLE public.assets_ref
  ADD COLUMN IF NOT EXISTS nivel text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS codigo_pai text,
  ADD COLUMN IF NOT EXISTS descricao_pai text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS unidade_negocio text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS assets_ref_codigo_pai_idx ON public.assets_ref (codigo_pai);
CREATE INDEX IF NOT EXISTS assets_ref_nivel_idx ON public.assets_ref (nivel);

-- 2) backorder_os: flag de revisão manual
ALTER TABLE public.backorder_os
  ADD COLUMN IF NOT EXISTS revisao_manual boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS backorder_os_revisao_idx
  ON public.backorder_os (revisao_manual) WHERE revisao_manual = true;

-- 3) Tabela de regras de classificação (editável)
CREATE TABLE IF NOT EXISTS public.regras_classificacao_equipe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe text NOT NULL,
  palavra_chave text NOT NULL,
  prioridade integer NOT NULL DEFAULT 100,
  fonte text NOT NULL DEFAULT 'descricao', -- 'descricao' | 'categoria'
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (equipe, palavra_chave, fonte)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.regras_classificacao_equipe TO authenticated;
GRANT ALL ON public.regras_classificacao_equipe TO service_role;

ALTER TABLE public.regras_classificacao_equipe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regras auth read" ON public.regras_classificacao_equipe
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "regras auth write" ON public.regras_classificacao_equipe
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER regras_touch
  BEFORE UPDATE ON public.regras_classificacao_equipe
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed de regras (ordem de prioridade menor = avaliado antes)
INSERT INTO public.regras_classificacao_equipe (equipe, palavra_chave, prioridade, fonte) VALUES
  ('Chaveiro', 'fechadura', 10, 'descricao'),
  ('Chaveiro', 'chave', 10, 'descricao'),
  ('Chaveiro', 'macaneta', 10, 'descricao'),
  ('Chaveiro', 'cadeado', 10, 'descricao'),
  ('Chaveiro', 'trinco', 10, 'descricao'),
  ('Chaveiro', 'miolo', 10, 'descricao'),
  ('Chaveiro', 'cilindro', 10, 'descricao'),
  ('Chaveiro', 'segredo', 10, 'descricao'),
  ('Pintura', 'pintura', 20, 'descricao'),
  ('Pintura', 'pintar', 20, 'descricao'),
  ('Pintura', 'repintura', 20, 'descricao'),
  ('Pintura', 'demarcacao', 20, 'descricao'),
  ('Pintura', 'demarcar', 20, 'descricao'),
  ('Pintura', 'sinalizacao de piso', 20, 'descricao'),
  ('Pintura', 'faixa de piso', 20, 'descricao'),
  ('Pintura', 'tinta', 20, 'descricao'),
  ('Pintura', 'verniz', 20, 'descricao'),
  ('Refrigeração', 'ar condicionado', 30, 'descricao'),
  ('Refrigeração', 'ar-condicionado', 30, 'descricao'),
  ('Refrigeração', 'climatiza', 30, 'descricao'),
  ('Refrigeração', 'split', 30, 'descricao'),
  ('Refrigeração', 'chiller', 30, 'descricao'),
  ('Refrigeração', 'refrigera', 30, 'descricao'),
  ('Refrigeração', 'geladeira', 30, 'descricao'),
  ('Refrigeração', 'freezer', 30, 'descricao'),
  ('Refrigeração', 'exaustor', 30, 'descricao'),
  ('Refrigeração', 'climat', 30, 'categoria'),
  ('Refrigeração', 'refrig', 30, 'categoria'),
  ('Elétrica', 'eletr', 40, 'categoria'),
  ('Elétrica', 'tomada', 40, 'descricao'),
  ('Elétrica', 'disjuntor', 40, 'descricao'),
  ('Elétrica', 'curto', 40, 'descricao'),
  ('Elétrica', 'iluminacao', 40, 'descricao'),
  ('Elétrica', 'lampada', 40, 'descricao'),
  ('Elétrica', 'luminaria', 40, 'descricao'),
  ('Elétrica', 'interruptor', 40, 'descricao'),
  ('Elétrica', 'quadro eletrico', 40, 'descricao'),
  ('Elétrica', 'fiacao', 40, 'descricao'),
  ('Hidráulica', 'hidr', 50, 'categoria'),
  ('Hidráulica', 'vazamento', 50, 'descricao'),
  ('Hidráulica', 'valvula', 50, 'descricao'),
  ('Hidráulica', 'descarga', 50, 'descricao'),
  ('Hidráulica', 'torneira', 50, 'descricao'),
  ('Hidráulica', 'encanamento', 50, 'descricao'),
  ('Hidráulica', 'esgoto', 50, 'descricao'),
  ('Hidráulica', 'ralo', 50, 'descricao'),
  ('Hidráulica', 'bomba', 50, 'descricao'),
  ('Hidráulica', 'sifao', 50, 'descricao'),
  ('Hidráulica', 'mictorio', 50, 'descricao'),
  ('Hidráulica', 'vaso sanitario', 50, 'descricao'),
  ('Hidráulica', 'entupimento', 50, 'descricao'),
  ('Civil', 'civil', 90, 'categoria'),
  ('Civil', 'marcen', 90, 'categoria'),
  ('Civil', 'alvenaria', 90, 'descricao'),
  ('Civil', 'piso', 90, 'descricao'),
  ('Civil', 'parede', 90, 'descricao'),
  ('Civil', 'teto', 90, 'descricao'),
  ('Civil', 'forro', 90, 'descricao'),
  ('Civil', 'porta', 90, 'descricao'),
  ('Civil', 'janela', 90, 'descricao'),
  ('Civil', 'esquadria', 90, 'descricao'),
  ('Civil', 'drywall', 90, 'descricao'),
  ('Civil', 'gesso', 90, 'descricao'),
  ('Civil', 'reboco', 90, 'descricao'),
  ('Civil', 'trinca', 90, 'descricao'),
  ('Civil', 'telha', 90, 'descricao'),
  ('Civil', 'revestimento', 90, 'descricao')
ON CONFLICT (equipe, palavra_chave, fonte) DO NOTHING;
